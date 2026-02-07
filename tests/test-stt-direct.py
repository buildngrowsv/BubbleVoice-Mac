#!/usr/bin/env python3
"""
============================================================
DIRECT STT TEST HARNESS
============================================================

This script spawns the Swift helper binary directly (no Node.js,
no Electron) and runs a battery of speech-to-text tests.

It communicates with the helper via JSON over stdin/stdout,
exactly like VoicePipelineService does in production.

TESTS:
 1) Smoke test — does the helper start and send "ready"?
 2) Startup latency — time from start_listening to first transcription_update
 3) TTS-to-STT accuracy — play "say" while STT listens, check output
 4) Session reset — stop + start, verify no text bleed
 5) Echo test — play say while STT runs using helper's speak command
 6) Sentence accuracy — specific sentences via say
 7) Interactive — announce to user, capture their counting

USAGE:
  python3 tests/test-stt-direct.py
============================================================
"""

import subprocess
import json
import time
import sys
import os
import threading
import signal
import queue

# ============================================================
# CONFIGURATION
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
HELPER_BIN = os.path.join(PROJECT_DIR, "swift-helper", "BubbleVoiceSpeech", ".build", "debug", "BubbleVoiceSpeech")
LOG_FILE = os.path.join(PROJECT_DIR, "docs", "stt-test-results.txt")

# Timing constants (seconds)
STARTUP_WAIT = 2.0        # Wait for helper to send ready
LISTEN_STARTUP_WAIT = 3.0 # Wait after start_listening before speaking
POST_SPEECH_WAIT = 4.0    # Wait after say finishes for STT to process
SESSION_GAP = 2.0         # Wait between sessions

# ============================================================
# COLORS
# ============================================================

class C:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    CYAN = '\033[0;36m'
    BOLD = '\033[1m'
    NC = '\033[0m'

# ============================================================
# HELPER PROCESS MANAGER
# ============================================================

class SpeechHelperProcess:
    """
    Manages the Swift helper subprocess.
    
    WHY A CLASS:
    We need to read stdout/stderr concurrently while sending
    commands to stdin. Python subprocess requires threading for
    non-blocking reads. This class encapsulates all of that.
    """
    
    def __init__(self, binary_path):
        self.binary_path = binary_path
        self.process = None
        self.stdout_lines = []  # All lines from stdout (JSON responses)
        self.stderr_lines = []  # All lines from stderr (debug logs)
        self.stdout_queue = queue.Queue()  # For waiting on specific messages
        self._stdout_thread = None
        self._stderr_thread = None
        self._running = False
        
    def start(self):
        """Start the helper process."""
        self.process = subprocess.Popen(
            [self.binary_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0  # Unbuffered for real-time communication
        )
        self._running = True
        
        # Start reader threads
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()
        
    def _read_stdout(self):
        """Read stdout lines and store them with timestamps."""
        try:
            for line in iter(self.process.stdout.readline, b''):
                if not self._running:
                    break
                decoded = line.decode('utf-8').strip()
                if decoded:
                    entry = {
                        'raw': decoded,
                        'time': time.time(),
                        'parsed': None
                    }
                    try:
                        entry['parsed'] = json.loads(decoded)
                    except json.JSONDecodeError:
                        pass
                    self.stdout_lines.append(entry)
                    self.stdout_queue.put(entry)
        except Exception as e:
            if self._running:
                print(f"  [stdout reader error] {e}")
                
    def _read_stderr(self):
        """Read stderr lines (debug logs from the helper)."""
        try:
            for line in iter(self.process.stderr.readline, b''):
                if not self._running:
                    break
                decoded = line.decode('utf-8').strip()
                if decoded:
                    self.stderr_lines.append({
                        'text': decoded,
                        'time': time.time()
                    })
        except Exception as e:
            if self._running:
                print(f"  [stderr reader error] {e}")
    
    def send_command(self, cmd_type, data=None):
        """Send a JSON command to the helper via stdin."""
        cmd = {"type": cmd_type}
        if data is not None:
            cmd["data"] = data
        line = json.dumps(cmd) + "\n"
        self.process.stdin.write(line.encode('utf-8'))
        self.process.stdin.flush()
        return time.time()
    
    def wait_for_message(self, msg_type, timeout=10.0):
        """
        Wait for a specific message type from stdout.
        Returns the parsed message or None on timeout.
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                entry = self.stdout_queue.get(timeout=min(remaining, 0.5))
                if entry['parsed'] and entry['parsed'].get('type') == msg_type:
                    return entry
            except queue.Empty:
                continue
        return None
    
    def get_transcriptions_since(self, since_time):
        """Get all transcription_update messages after a given timestamp."""
        return [
            e for e in self.stdout_lines
            if e['parsed']
            and e['parsed'].get('type') == 'transcription_update'
            and e['time'] >= since_time
        ]
    
    def get_all_transcriptions(self):
        """Get all transcription_update messages."""
        return [
            e for e in self.stdout_lines
            if e['parsed']
            and e['parsed'].get('type') == 'transcription_update'
        ]
    
    def drain_queue(self):
        """Empty the queue without processing."""
        while not self.stdout_queue.empty():
            try:
                self.stdout_queue.get_nowait()
            except queue.Empty:
                break
    
    def stop(self):
        """Stop the helper process."""
        self._running = False
        if self.process:
            try:
                self.process.stdin.close()
            except:
                pass
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                try:
                    self.process.kill()
                except:
                    pass
    
    def dump_stderr(self, last_n=None):
        """Print stderr lines for debugging."""
        lines = self.stderr_lines[-last_n:] if last_n else self.stderr_lines
        for entry in lines:
            print(f"  {C.YELLOW}[stderr]{C.NC} {entry['text']}")


def log(msg):
    """Log to both terminal and file."""
    timestamp = time.strftime('%H:%M:%S')
    ms = f"{time.time() % 1:.3f}"[1:]
    formatted = f"[{timestamp}{ms}] {msg}"
    # Strip color codes for file
    import re
    clean = re.sub(r'\033\[[0-9;]*m', '', formatted)
    print(formatted)
    with open(LOG_FILE, 'a') as f:
        f.write(clean + '\n')


def log_section(title):
    """Print a section header."""
    print()
    print(f"{C.CYAN}{'='*60}{C.NC}")
    print(f"{C.CYAN}  {title}{C.NC}")
    print(f"{C.CYAN}{'='*60}{C.NC}")
    with open(LOG_FILE, 'a') as f:
        f.write(f"\n{'='*60}\n  {title}\n{'='*60}\n")


def say_and_wait(text, rate=140):
    """
    Play text using macOS say command and wait for it to finish.
    Returns the duration in seconds.
    """
    start = time.time()
    proc = subprocess.run(
        ["/usr/bin/say", "-r", str(rate), text],
        capture_output=True, timeout=30
    )
    elapsed = time.time() - start
    return elapsed


def say_async(text, rate=140):
    """
    Play text using macOS say command without waiting.
    Returns the subprocess.Popen object.
    """
    return subprocess.Popen(
        ["/usr/bin/say", "-r", str(rate), text],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


def print_transcriptions(transcriptions, label=""):
    """Pretty-print a list of transcription entries."""
    if not transcriptions:
        log(f"{C.RED}  No transcriptions received{C.NC}")
        return
    for i, entry in enumerate(transcriptions):
        data = entry['parsed'].get('data', {})
        text = data.get('text', '<no text>')
        is_final = data.get('isFinal', False)
        is_speaking = data.get('isSpeaking', False)
        marker = f"{C.GREEN}[FINAL]{C.NC}" if is_final else "[partial]"
        speaking = f" {C.YELLOW}(TTS active){C.NC}" if is_speaking else ""
        log(f"  {marker} '{text}'{speaking}")


# ============================================================
# MAIN TEST RUNNER
# ============================================================

def main():
    # Clear log file
    with open(LOG_FILE, 'w') as f:
        f.write(f"STT Direct Test Results — {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Helper binary: {HELPER_BIN}\n\n")
    
    if not os.path.exists(HELPER_BIN):
        print(f"{C.RED}ERROR: Helper binary not found at {HELPER_BIN}{C.NC}")
        print("Run: cd swift-helper/BubbleVoiceSpeech && swift build -c debug")
        sys.exit(1)
    
    helper = SpeechHelperProcess(HELPER_BIN)
    
    try:
        # ==================================================
        # TEST 0: SMOKE TEST
        # ==================================================
        log_section("TEST 0: Smoke Test — Does the helper start?")
        
        helper.start()
        log("Helper process started")
        
        # Wait for ready
        ready = helper.wait_for_message("ready", timeout=5.0)
        if ready:
            log(f"{C.GREEN}PASS: Helper sent 'ready' signal{C.NC}")
        else:
            log(f"{C.RED}FAIL: No 'ready' signal within 5s{C.NC}")
            helper.dump_stderr()
            helper.stop()
            sys.exit(1)
        
        # Show any startup logs
        time.sleep(0.5)
        helper.dump_stderr()
        
        # ==================================================
        # TEST 1: STARTUP LATENCY + TTS-TO-STT
        # ==================================================
        log_section("TEST 1: Startup Latency + TTS-to-STT (say → mic → STT)")
        
        # Record the time we send start_listening
        start_listen_time = helper.send_command("start_listening")
        log(f"Sent start_listening")
        
        # Wait for the listening system to warm up
        time.sleep(LISTEN_STARTUP_WAIT)
        
        # Check stderr for startup messages
        helper.dump_stderr(last_n=5)
        
        # Now speak via system say command
        test_phrase = "one two three four five six seven eight nine ten"
        log(f"Playing via say: '{test_phrase}'")
        pre_speech_time = time.time()
        say_duration = say_and_wait(test_phrase, rate=120)
        log(f"Say finished in {say_duration:.2f}s")
        
        # Wait for STT to catch up
        time.sleep(POST_SPEECH_WAIT)
        
        # Collect results
        transcriptions = helper.get_transcriptions_since(start_listen_time)
        log(f"\n=== TEST 1 RESULTS ({len(transcriptions)} updates) ===")
        print_transcriptions(transcriptions)
        
        # Check if first transcription arrived and measure latency
        if transcriptions:
            first_time = transcriptions[0]['time']
            latency = first_time - pre_speech_time
            log(f"\n  First transcription latency (from say start): {latency:.3f}s")
            
            # Check the final/last transcription for completeness
            last_text = transcriptions[-1]['parsed']['data'].get('text', '')
            expected_words = test_phrase.lower().split()
            got_words = last_text.lower().split()
            matched = len(set(expected_words) & set(got_words))
            log(f"  Expected words: {len(expected_words)}")
            log(f"  Got words: {len(got_words)}")
            log(f"  Matched: {matched}/{len(expected_words)}")
            if matched >= 8:
                log(f"  {C.GREEN}PASS: Good word capture{C.NC}")
            elif matched >= 5:
                log(f"  {C.YELLOW}PARTIAL: Some words missed{C.NC}")
            else:
                log(f"  {C.RED}FAIL: Most words missed{C.NC}")
        else:
            log(f"  {C.RED}FAIL: No transcriptions at all!{C.NC}")
        
        # Stop listening
        helper.send_command("stop_listening")
        time.sleep(SESSION_GAP)
        helper.drain_queue()
        
        # ==================================================
        # TEST 2: SESSION RESET — TEXT BLEED CHECK
        # ==================================================
        log_section("TEST 2: Session Reset — Text Bleed Check")
        
        session2_start = helper.send_command("start_listening")
        log("Sent start_listening (session 2)")
        time.sleep(LISTEN_STARTUP_WAIT)
        
        # Speak a completely different phrase
        test_phrase_2 = "banana chocolate strawberry"
        log(f"Playing via say: '{test_phrase_2}'")
        say_and_wait(test_phrase_2, rate=130)
        time.sleep(POST_SPEECH_WAIT)
        
        # Check results
        transcriptions2 = helper.get_transcriptions_since(session2_start)
        log(f"\n=== TEST 2 RESULTS ({len(transcriptions2)} updates) ===")
        print_transcriptions(transcriptions2)
        
        # Check for bleed from session 1
        if transcriptions2:
            all_text = " ".join(
                e['parsed']['data'].get('text', '') for e in transcriptions2
            ).lower()
            bleed_words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
            found_bleed = [w for w in bleed_words if w in all_text.split()]
            if found_bleed:
                log(f"  {C.RED}FAIL: Text bleed detected! Found: {found_bleed}{C.NC}")
            else:
                log(f"  {C.GREEN}PASS: No text bleed from session 1{C.NC}")
        
        helper.send_command("stop_listening")
        time.sleep(SESSION_GAP)
        helper.drain_queue()
        
        # ==================================================
        # TEST 3: ECHO TEST — HELPER SPEAK + STT
        # ==================================================
        log_section("TEST 3: Echo Test — Helper speak command while STT runs")
        
        session3_start = helper.send_command("start_listening")
        log("Sent start_listening (session 3)")
        time.sleep(LISTEN_STARTUP_WAIT)
        
        # Use the helper's own speak command (mirrors production behavior)
        echo_text = "Hello I am the AI assistant how are you doing today"
        log(f"Sending speak command: '{echo_text}'")
        helper.send_command("speak", {"text": echo_text, "rate": 180})
        
        # Wait for speech to finish
        speech_started = helper.wait_for_message("speech_started", timeout=3)
        if speech_started:
            log("  speech_started received")
        speech_ended = helper.wait_for_message("speech_ended", timeout=15)
        if speech_ended:
            log("  speech_ended received")
        
        time.sleep(2)  # Extra buffer for STT to settle
        
        # Check what STT captured
        transcriptions3 = helper.get_transcriptions_since(session3_start)
        log(f"\n=== TEST 3 ECHO RESULTS ({len(transcriptions3)} updates) ===")
        if not transcriptions3:
            log(f"  {C.GREEN}No echo detected (no transcriptions during TTS){C.NC}")
        else:
            print_transcriptions(transcriptions3)
            # Check if isSpeaking flag is set
            speaking_flagged = sum(
                1 for e in transcriptions3
                if e['parsed']['data'].get('isSpeaking', False)
            )
            log(f"\n  Transcriptions with isSpeaking=true: {speaking_flagged}/{len(transcriptions3)}")
            if speaking_flagged == len(transcriptions3):
                log(f"  {C.GREEN}PASS: All echo transcriptions correctly flagged as isSpeaking{C.NC}")
            elif speaking_flagged > 0:
                log(f"  {C.YELLOW}PARTIAL: Some echo transcriptions flagged{C.NC}")
            else:
                log(f"  {C.RED}WARNING: Echo detected but NOT flagged as isSpeaking{C.NC}")
        
        helper.send_command("stop_listening")
        time.sleep(SESSION_GAP)
        helper.drain_queue()
        
        # ==================================================
        # TEST 4: SENTENCE ACCURACY
        # ==================================================
        log_section("TEST 4: Sentence Accuracy")
        
        test_sentences = [
            "The quick brown fox jumps over the lazy dog",
            "She sells seashells by the seashore",
            "How much wood would a woodchuck chuck if a woodchuck could chuck wood"
        ]
        
        for i, sentence in enumerate(test_sentences):
            session4_start = helper.send_command("start_listening")
            log(f"\nSentence {i+1}: '{sentence}'")
            time.sleep(LISTEN_STARTUP_WAIT)
            
            say_and_wait(sentence, rate=140)
            time.sleep(POST_SPEECH_WAIT)
            
            transcriptions4 = helper.get_transcriptions_since(session4_start)
            if transcriptions4:
                last_text = transcriptions4[-1]['parsed']['data'].get('text', '')
                expected_words = set(sentence.lower().split())
                got_words = set(last_text.lower().split())
                matched = len(expected_words & got_words)
                total = len(expected_words)
                pct = (matched / total) * 100 if total > 0 else 0
                
                log(f"  Expected: '{sentence}'")
                log(f"  Got:      '{last_text}'")
                log(f"  Word match: {matched}/{total} ({pct:.0f}%)")
                
                if pct >= 80:
                    log(f"  {C.GREEN}PASS{C.NC}")
                elif pct >= 50:
                    log(f"  {C.YELLOW}PARTIAL{C.NC}")
                else:
                    log(f"  {C.RED}FAIL{C.NC}")
            else:
                log(f"  {C.RED}FAIL: No transcriptions{C.NC}")
            
            helper.send_command("stop_listening")
            time.sleep(SESSION_GAP)
            helper.drain_queue()
        
        # ==================================================
        # TEST 5: RAPID RESET TEST
        # ==================================================
        log_section("TEST 5: Rapid Reset — reset_recognition command")
        
        session5_start = helper.send_command("start_listening")
        log("Sent start_listening")
        time.sleep(LISTEN_STARTUP_WAIT)
        
        # Play first phrase
        log("Playing: 'alpha bravo charlie'")
        say_and_wait("alpha bravo charlie", rate=140)
        time.sleep(2)
        
        # Show what we got before reset
        pre_reset = helper.get_transcriptions_since(session5_start)
        log(f"  Pre-reset transcriptions: {len(pre_reset)}")
        print_transcriptions(pre_reset)
        
        # Send reset
        reset_time = helper.send_command("reset_recognition")
        log("Sent reset_recognition")
        time.sleep(LISTEN_STARTUP_WAIT)
        
        # Play different phrase
        log("Playing: 'delta echo foxtrot'")
        say_and_wait("delta echo foxtrot", rate=140)
        time.sleep(POST_SPEECH_WAIT)
        
        # Check post-reset results
        post_reset = helper.get_transcriptions_since(reset_time)
        log(f"\n  Post-reset transcriptions: {len(post_reset)}")
        print_transcriptions(post_reset)
        
        # Check for bleed
        if post_reset:
            all_post_text = " ".join(
                e['parsed']['data'].get('text', '') for e in post_reset
            ).lower()
            if 'alpha' in all_post_text or 'bravo' in all_post_text or 'charlie' in all_post_text:
                log(f"  {C.RED}FAIL: Text bleed after reset!{C.NC}")
            else:
                log(f"  {C.GREEN}PASS: No text bleed after reset{C.NC}")
        
        helper.send_command("stop_listening")
        time.sleep(SESSION_GAP)
        helper.drain_queue()
        
        # ==================================================
        # TEST 6: SELF-TALK — say command continuously while STT runs
        # ==================================================
        log_section("TEST 6: Self-Talk — Continuous TTS while STT listens")
        
        session6_start = helper.send_command("start_listening")
        log("Sent start_listening")
        time.sleep(LISTEN_STARTUP_WAIT)
        
        # Fire off multiple say commands rapidly
        phrases = [
            "testing one",
            "testing two",
            "testing three"
        ]
        for phrase in phrases:
            log(f"  Saying: '{phrase}'")
            say_and_wait(phrase, rate=160)
            time.sleep(0.5)
        
        time.sleep(POST_SPEECH_WAIT)
        
        transcriptions6 = helper.get_transcriptions_since(session6_start)
        log(f"\n=== SELF-TALK RESULTS ({len(transcriptions6)} updates) ===")
        print_transcriptions(transcriptions6)
        
        helper.send_command("stop_listening")
        time.sleep(SESSION_GAP)
        helper.drain_queue()
        
        # ==================================================
        # TEST 7: INTERACTIVE — USER COUNTING
        # ==================================================
        log_section("TEST 7: Interactive — YOUR TURN TO COUNT")
        
        log(f"{C.BOLD}{C.YELLOW}")
        log("  I will announce 'Start counting now' via speakers.")
        log("  After the announcement, count from 1 to 10,")
        log("  saying one number per second.")
        log(f"  I will listen for 15 seconds.{C.NC}")
        log("")
        
        session7_start = helper.send_command("start_listening")
        log("Sent start_listening")
        time.sleep(LISTEN_STARTUP_WAIT)
        
        # Announce to the user
        log(f"{C.YELLOW}>>> ANNOUNCING NOW <<<{C.NC}")
        say_and_wait("Start counting now. One number per second.", rate=160)
        
        announce_done_time = time.time()
        log(f"Announcement done. Listening for 15 seconds...")
        
        # Listen for 15 seconds
        time.sleep(15)
        
        # Collect results
        transcriptions7 = helper.get_transcriptions_since(announce_done_time)
        log(f"\n=== YOUR COUNTING RESULTS ({len(transcriptions7)} updates) ===")
        print_transcriptions(transcriptions7)
        
        if transcriptions7:
            # Show the final accumulated text
            last_text = transcriptions7[-1]['parsed']['data'].get('text', '')
            log(f"\n  Final accumulated text: '{last_text}'")
            
            # Check which numbers came through
            number_words = ['one', 'two', 'three', 'four', 'five', 
                          'six', 'seven', 'eight', 'nine', 'ten',
                          '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
            found = [w for w in number_words if w in last_text.lower().split()]
            log(f"  Numbers detected: {found}")
            log(f"  Count: {len(found)}/10")
        
        helper.send_command("stop_listening")
        time.sleep(1)
        
        # ==================================================
        # FINAL SUMMARY
        # ==================================================
        log_section("TEST COMPLETE — FULL STDERR DUMP")
        helper.dump_stderr()
        
        log_section("SUMMARY")
        total_transcriptions = len(helper.get_all_transcriptions())
        log(f"  Total transcription updates received: {total_transcriptions}")
        log(f"  Total stderr lines: {len(helper.stderr_lines)}")
        log(f"  Full results saved to: {LOG_FILE}")
        
    finally:
        helper.stop()
        log("Helper process stopped")


if __name__ == "__main__":
    main()
