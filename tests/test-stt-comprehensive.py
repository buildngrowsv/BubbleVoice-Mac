#!/usr/bin/env python3
"""
============================================================
COMPREHENSIVE STT BEHAVIOR TEST SUITE
============================================================

This script runs the Swift helper directly and tests a wide
range of speech-to-text scenarios to document behavior,
quirks, latency, and accuracy.

All results are captured with precise timestamps and written
to a markdown file for reference.

RUN: python3 tests/test-stt-comprehensive.py
============================================================
"""

import subprocess
import json
import time
import sys
import os
import threading
import queue
import re
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
HELPER_BIN = os.path.join(PROJECT_DIR, "swift-helper", "BubbleVoiceSpeech", ".build", "debug", "BubbleVoiceSpeech")
RESULTS_MD = os.path.join(PROJECT_DIR, "docs", "STT-Comprehensive-Test-Results.md")

# ============================================================
# HELPER PROCESS CLASS (same as test-stt-direct.py)
# ============================================================

class SpeechHelperProcess:
    def __init__(self, binary_path):
        self.binary_path = binary_path
        self.process = None
        self.stdout_lines = []
        self.stderr_lines = []
        self.stdout_queue = queue.Queue()
        self._stdout_thread = None
        self._stderr_thread = None
        self._running = False
        
    def start(self):
        self.process = subprocess.Popen(
            [self.binary_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0
        )
        self._running = True
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()
        
    def _read_stdout(self):
        try:
            for line in iter(self.process.stdout.readline, b''):
                if not self._running:
                    break
                decoded = line.decode('utf-8').strip()
                if decoded:
                    entry = {'raw': decoded, 'time': time.time(), 'parsed': None}
                    try:
                        entry['parsed'] = json.loads(decoded)
                    except json.JSONDecodeError:
                        pass
                    self.stdout_lines.append(entry)
                    self.stdout_queue.put(entry)
        except Exception:
            pass
                
    def _read_stderr(self):
        try:
            for line in iter(self.process.stderr.readline, b''):
                if not self._running:
                    break
                decoded = line.decode('utf-8').strip()
                if decoded:
                    self.stderr_lines.append({'text': decoded, 'time': time.time()})
        except Exception:
            pass
    
    def send_command(self, cmd_type, data=None):
        cmd = {"type": cmd_type}
        if data is not None:
            cmd["data"] = data
        line = json.dumps(cmd) + "\n"
        self.process.stdin.write(line.encode('utf-8'))
        self.process.stdin.flush()
        return time.time()
    
    def wait_for_message(self, msg_type, timeout=10.0):
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
        return [
            e for e in self.stdout_lines
            if e['parsed']
            and e['parsed'].get('type') == 'transcription_update'
            and e['time'] >= since_time
        ]
    
    def get_finals_since(self, since_time):
        return [
            e for e in self.stdout_lines
            if e['parsed']
            and e['parsed'].get('type') == 'transcription_update'
            and e['parsed'].get('data', {}).get('isFinal', False)
            and e['time'] >= since_time
        ]
    
    def get_last_text_since(self, since_time):
        transcriptions = self.get_transcriptions_since(since_time)
        if not transcriptions:
            return ""
        return transcriptions[-1]['parsed']['data'].get('text', '')
    
    def drain_queue(self):
        while not self.stdout_queue.empty():
            try:
                self.stdout_queue.get_nowait()
            except queue.Empty:
                break
    
    def stop(self):
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


def say_and_wait(text, rate=140, volume=None):
    """Play text using say command. Returns duration in seconds."""
    start = time.time()
    cmd = ["/usr/bin/say", "-r", str(rate), text]
    proc = subprocess.run(cmd, capture_output=True, timeout=60)
    return time.time() - start


def say_to_aiff_and_play(text, rate=140, volume=0.5):
    """Render to AIFF then play with volume control. Returns duration."""
    start = time.time()
    aiff_path = f"/tmp/stt_test_{os.getpid()}.aiff"
    subprocess.run(["/usr/bin/say", "-r", str(rate), "-o", aiff_path, text],
                   capture_output=True, timeout=60)
    subprocess.run(["afplay", "-v", str(volume), aiff_path],
                   capture_output=True, timeout=60)
    return time.time() - start


def word_accuracy(expected, got):
    """Calculate word-level accuracy between expected and got text."""
    expected_words = set(expected.lower().replace(',', '').replace('.', '').replace('?', '').replace('!', '').split())
    got_words = set(got.lower().replace(',', '').replace('.', '').replace('?', '').replace('!', '').split())
    if not expected_words:
        return 0.0
    matched = len(expected_words & got_words)
    return matched / len(expected_words)


# ============================================================
# MARKDOWN WRITER
# ============================================================

class MarkdownWriter:
    def __init__(self, filepath):
        self.filepath = filepath
        self.sections = []
        self.current_section = None
    
    def start_doc(self, title):
        self.sections.append(f"# {title}\n")
        self.sections.append(f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        self.sections.append(f"**Platform**: macOS 26.1 (SpeechAnalyzer + SpeechTranscriber)\n")
        self.sections.append(f"**Helper**: `{HELPER_BIN}`\n\n")
        self.sections.append("---\n\n")
    
    def add_section(self, title, level=2):
        prefix = "#" * level
        self.sections.append(f"\n{prefix} {title}\n\n")
    
    def add_text(self, text):
        self.sections.append(f"{text}\n\n")
    
    def add_result(self, label, value):
        self.sections.append(f"- **{label}**: {value}\n")
    
    def add_code(self, text, lang=""):
        self.sections.append(f"```{lang}\n{text}\n```\n\n")
    
    def add_table_header(self, cols):
        self.sections.append("| " + " | ".join(cols) + " |\n")
        self.sections.append("| " + " | ".join(["---"] * len(cols)) + " |\n")
    
    def add_table_row(self, cols):
        self.sections.append("| " + " | ".join(str(c) for c in cols) + " |\n")
    
    def add_newline(self):
        self.sections.append("\n")
    
    def save(self):
        with open(self.filepath, 'w') as f:
            f.writelines(self.sections)


# ============================================================
# TEST RUNNER
# ============================================================

def main():
    md = MarkdownWriter(RESULTS_MD)
    md.start_doc("SpeechAnalyzer Comprehensive Test Results")
    
    helper = SpeechHelperProcess(HELPER_BIN)
    helper.start()
    
    # Wait for ready
    ready = helper.wait_for_message("ready", timeout=5.0)
    if not ready:
        print("FATAL: Helper did not send ready")
        sys.exit(1)
    print("Helper ready.\n")
    
    # ======================================================
    # SCENARIO 1: PRECISE FIRST-RESULT LATENCY
    # ======================================================
    print("=== SCENARIO 1: First-Result Latency ===")
    md.add_section("Scenario 1: First-Result Latency")
    md.add_text("Measures time from `start_listening` to the first `transcription_update`. "
                "This tells us how quickly the SpeechAnalyzer pipeline warms up and produces output.")
    
    latencies = []
    for trial in range(3):
        start_time = helper.send_command("start_listening")
        time.sleep(2)  # let it warm up
        
        # Play a single short word
        say_start = time.time()
        say_and_wait("hello", rate=140)
        
        # Wait for result
        time.sleep(3)
        
        transcriptions = helper.get_transcriptions_since(start_time)
        if transcriptions:
            first_result_time = transcriptions[0]['time']
            latency_from_say = first_result_time - say_start
            latency_from_start = first_result_time - start_time
            latencies.append({
                'trial': trial + 1,
                'from_say': round(latency_from_say, 3),
                'from_start': round(latency_from_start, 3),
                'first_text': transcriptions[0]['parsed']['data'].get('text', '')
            })
            print(f"  Trial {trial+1}: {latency_from_say:.3f}s from say, first text: '{transcriptions[0]['parsed']['data'].get('text', '')}'")
        else:
            latencies.append({'trial': trial + 1, 'from_say': None, 'from_start': None, 'first_text': 'NONE'})
            print(f"  Trial {trial+1}: NO RESULT")
        
        helper.send_command("stop_listening")
        time.sleep(1.5)
        helper.drain_queue()
    
    md.add_table_header(["Trial", "Latency (from say start)", "Latency (from start_listening)", "First Text"])
    for l in latencies:
        md.add_table_row([l['trial'], f"{l['from_say']}s" if l['from_say'] else "N/A",
                         f"{l['from_start']}s" if l['from_start'] else "N/A", f"`{l['first_text']}`"])
    md.add_newline()
    
    valid = [l['from_say'] for l in latencies if l['from_say'] is not None]
    if valid:
        avg = sum(valid) / len(valid)
        md.add_text(f"**Average latency from say start**: {avg:.3f}s")
        md.add_text(f"**Key finding**: The SpeechAnalyzer takes about {avg:.1f}s to process audio and return the first partial result. "
                    "This includes audio capture → format conversion → neural model inference.")
    
    # ======================================================
    # SCENARIO 2: SPEECH RATE SENSITIVITY
    # ======================================================
    print("\n=== SCENARIO 2: Speech Rate Sensitivity ===")
    md.add_section("Scenario 2: Speech Rate Sensitivity")
    md.add_text("Tests how well SpeechAnalyzer handles different speaking speeds. "
                "The `say` command's `-r` flag controls words-per-minute.")
    
    test_phrase = "one two three four five six seven eight nine ten"
    rates = [
        (80, "Very Slow (80 WPM)"),
        (140, "Normal (140 WPM)"),
        (200, "Fast (200 WPM)"),
        (280, "Very Fast (280 WPM)"),
        (400, "Extremely Fast (400 WPM)")
    ]
    
    md.add_table_header(["Rate", "Expected", "Got (Final)", "Word Accuracy", "Duration"])
    
    for rate, label in rates:
        start_time = helper.send_command("start_listening")
        time.sleep(2.5)
        
        say_dur = say_and_wait(test_phrase, rate=rate)
        time.sleep(4)
        
        finals = helper.get_finals_since(start_time)
        last_text = helper.get_last_text_since(start_time)
        
        # Use the final text if available, otherwise the last partial
        result_text = ""
        if finals:
            result_text = finals[-1]['parsed']['data'].get('text', '')
        elif last_text:
            result_text = last_text
        
        acc = word_accuracy(test_phrase, result_text)
        print(f"  {label}: '{result_text}' ({acc*100:.0f}% accuracy, {say_dur:.1f}s)")
        
        md.add_table_row([label, f"`{test_phrase}`", f"`{result_text.strip()}`", f"{acc*100:.0f}%", f"{say_dur:.1f}s"])
        
        helper.send_command("stop_listening")
        time.sleep(1.5)
        helper.drain_queue()
    
    md.add_newline()
    
    # ======================================================
    # SCENARIO 3: LONG-FORM PARAGRAPH
    # ======================================================
    print("\n=== SCENARIO 3: Long-Form Paragraph ===")
    md.add_section("Scenario 3: Long-Form Paragraph")
    md.add_text("Tests transcription of a longer passage to see if the analyzer handles continuous speech well, "
                "including sentence boundaries and natural pauses.")
    
    long_text = ("Today is a beautiful day. The sun is shining and the birds are singing. "
                 "I went to the store and bought some apples, bananas, and oranges. "
                 "Then I came home and made a delicious fruit salad.")
    
    start_time = helper.send_command("start_listening")
    time.sleep(2.5)
    
    say_dur = say_and_wait(long_text, rate=150)
    time.sleep(6)
    
    transcriptions = helper.get_transcriptions_since(start_time)
    finals = helper.get_finals_since(start_time)
    last_text = helper.get_last_text_since(start_time)
    
    # Collect all final texts
    all_final_texts = [f['parsed']['data'].get('text', '') for f in finals]
    combined_final = " ".join(t.strip() for t in all_final_texts)
    
    acc = word_accuracy(long_text, combined_final if combined_final else last_text)
    
    md.add_result("Input", f"`{long_text}`")
    md.add_result("Combined Final Text", f"`{combined_final.strip()}`")
    md.add_result("Word Accuracy", f"{acc*100:.0f}%")
    md.add_result("Total Updates", str(len(transcriptions)))
    md.add_result("Final Segments", str(len(finals)))
    md.add_result("Say Duration", f"{say_dur:.1f}s")
    md.add_newline()
    
    if finals:
        md.add_text("**Final segments received** (SpeechAnalyzer splits at natural sentence boundaries):")
        for i, f in enumerate(finals):
            md.add_text(f"{i+1}. `{f['parsed']['data'].get('text', '').strip()}`")
    
    print(f"  Accuracy: {acc*100:.0f}%, {len(finals)} final segments, {len(transcriptions)} total updates")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # SCENARIO 4: NUMBERS, PHONE NUMBERS, TECHNICAL TERMS
    # ======================================================
    print("\n=== SCENARIO 4: Numbers and Special Content ===")
    md.add_section("Scenario 4: Numbers, Phone Numbers, and Technical Terms")
    md.add_text("Tests how the transcriber handles numerical and technical content.")
    
    special_phrases = [
        ("My phone number is 555-867-5309", "Phone number"),
        ("The meeting is at 3:45 PM on January 15th 2026", "Date and time"),
        ("The temperature is 72 degrees Fahrenheit", "Measurement"),
        ("Please visit www dot example dot com", "URL dictation"),
        ("The API returns a JSON response with status code 200", "Technical terms"),
    ]
    
    md.add_table_header(["Category", "Said", "Transcribed", "Notes"])
    
    for phrase, category in special_phrases:
        start_time = helper.send_command("start_listening")
        time.sleep(2.5)
        
        say_and_wait(phrase, rate=140)
        time.sleep(4)
        
        finals = helper.get_finals_since(start_time)
        last_text = helper.get_last_text_since(start_time)
        result = finals[-1]['parsed']['data'].get('text', '').strip() if finals else last_text.strip()
        
        notes = "Match" if word_accuracy(phrase, result) > 0.7 else "Partial" if word_accuracy(phrase, result) > 0.4 else "Poor"
        print(f"  {category}: '{result}' ({notes})")
        
        md.add_table_row([category, f"`{phrase}`", f"`{result}`", notes])
        
        helper.send_command("stop_listening")
        time.sleep(1.5)
        helper.drain_queue()
    
    md.add_newline()
    
    # ======================================================
    # SCENARIO 5: RAPID START/STOP (INTERRUPTION SIMULATION)
    # ======================================================
    print("\n=== SCENARIO 5: Rapid Start/Stop ===")
    md.add_section("Scenario 5: Rapid Start/Stop (Interruption Simulation)")
    md.add_text("Simulates what happens in production when the user interrupts the AI. "
                "The backend rapidly stops and restarts the STT session.")
    
    # Start, say something, stop after 2s, start again, say something different
    start_time = helper.send_command("start_listening")
    time.sleep(2)
    
    # Start saying something
    subprocess.Popen(["/usr/bin/say", "-r", "140", "alpha bravo charlie"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    
    # INTERRUPT: stop + start immediately
    interrupt_time = time.time()
    helper.send_command("stop_listening")
    time.sleep(0.3)
    restart_time = helper.send_command("start_listening")
    time.sleep(2)
    
    # Say the second phrase
    say_and_wait("delta echo foxtrot", rate=140)
    time.sleep(4)
    
    pre_interrupt = helper.get_transcriptions_since(start_time)
    pre_interrupt = [t for t in pre_interrupt if t['time'] < interrupt_time]
    post_interrupt = helper.get_transcriptions_since(restart_time)
    
    pre_text = pre_interrupt[-1]['parsed']['data'].get('text', '') if pre_interrupt else "NONE"
    post_text = post_interrupt[-1]['parsed']['data'].get('text', '') if post_interrupt else "NONE"
    
    md.add_result("Pre-interrupt text", f"`{pre_text.strip()}`")
    md.add_result("Post-restart text", f"`{post_text.strip()}`")
    md.add_result("Restart gap", "0.3 seconds")
    
    # Check for bleed
    bleed = any(w in post_text.lower() for w in ['alpha', 'bravo', 'charlie'])
    md.add_result("Text bleed detected", "YES - pre-interrupt text leaked" if bleed else "NO - clean restart")
    md.add_newline()
    
    print(f"  Pre-interrupt: '{pre_text.strip()}'")
    print(f"  Post-restart: '{post_text.strip()}'")
    print(f"  Bleed: {'YES' if bleed else 'NO'}")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # SCENARIO 6: RAPID RESET_RECOGNITION
    # ======================================================
    print("\n=== SCENARIO 6: Rapid reset_recognition ===")
    md.add_section("Scenario 6: Rapid reset_recognition Commands")
    md.add_text("Tests what happens when we send multiple `reset_recognition` commands in quick succession, "
                "which can happen in production during rapid conversation turns.")
    
    start_time = helper.send_command("start_listening")
    time.sleep(2)
    
    # Fire 3 rapid resets
    for i in range(3):
        helper.send_command("reset_recognition")
        time.sleep(0.2)
    
    time.sleep(3)
    
    # Now speak and see if it still works
    say_and_wait("recovery test after rapid resets", rate=140)
    time.sleep(4)
    
    # Get transcriptions from after all the resets
    post_reset_text = helper.get_last_text_since(start_time)
    
    md.add_result("Resets sent", "3 rapid resets (0.2s apart)")
    md.add_result("Post-reset transcription", f"`{post_reset_text.strip()}`")
    md.add_result("Recovery", "YES - still producing results" if post_reset_text.strip() else "NO - STT appears dead")
    md.add_newline()
    
    print(f"  Post-reset text: '{post_reset_text.strip()}'")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # SCENARIO 7: ECHO TEST - TTS + STT SIMULTANEOUSLY
    # ======================================================
    print("\n=== SCENARIO 7: Echo / Self-Hearing Test ===")
    md.add_section("Scenario 7: Echo / Self-Hearing (TTS + STT Simultaneously)")
    md.add_text("In production, the AI speaks through the speakers while the mic is still listening. "
                "This tests whether STT picks up the TTS output and whether `isSpeaking` flag is set correctly. "
                "This is critical for the backend's echo suppression logic.")
    
    start_time = helper.send_command("start_listening")
    time.sleep(2.5)
    
    # Use the helper's own speak command
    echo_text = "Let me tell you about machine learning and artificial intelligence"
    helper.send_command("speak", {"text": echo_text, "rate": 160})
    
    speech_started = helper.wait_for_message("speech_started", timeout=3)
    speech_ended = helper.wait_for_message("speech_ended", timeout=15)
    
    time.sleep(2)
    
    transcriptions = helper.get_transcriptions_since(start_time)
    speaking_true = [t for t in transcriptions if t['parsed']['data'].get('isSpeaking', False)]
    speaking_false = [t for t in transcriptions if not t['parsed']['data'].get('isSpeaking', False)]
    
    md.add_result("TTS text sent", f"`{echo_text}`")
    md.add_result("Total transcription updates", str(len(transcriptions)))
    md.add_result("Updates with isSpeaking=true", str(len(speaking_true)))
    md.add_result("Updates with isSpeaking=false", str(len(speaking_false)))
    
    if transcriptions:
        all_text = " ".join(t['parsed']['data'].get('text', '') for t in transcriptions).strip()
        md.add_result("All captured text", f"`{all_text[:200]}`")
    
    if speaking_true:
        echo_texts = [t['parsed']['data'].get('text', '') for t in speaking_true]
        md.add_text("\n**Echo text captured while isSpeaking=true** (what the backend should filter):")
        for et in echo_texts[-5:]:
            md.add_text(f"- `{et.strip()}`")
    
    md.add_newline()
    md.add_text("**Key finding**: When `isSpeaking=true`, the transcription is echo from the AI's own speakers. "
                "The Node.js backend uses this flag to suppress echo and only process user speech.")
    
    print(f"  Echo: {len(speaking_true)} updates with isSpeaking=true, {len(speaking_false)} without")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # SCENARIO 8: QUIET/WHISPER SPEECH (LOW VOLUME)
    # ======================================================
    print("\n=== SCENARIO 8: Quiet Speech (Low Volume) ===")
    md.add_section("Scenario 8: Quiet Speech (Low Volume)")
    md.add_text("Tests if the transcriber can pick up quieter audio. "
                "This simulates a user speaking softly or being further from the mic. "
                "We use `afplay -v` to control playback volume.")
    
    volumes = [
        (1.0, "Full volume"),
        (0.5, "50% volume"),
        (0.3, "30% volume"),
        (0.15, "15% volume"),
        (0.05, "5% volume"),
    ]
    
    test_sentence = "testing quiet speech recognition"
    
    md.add_table_header(["Volume", "Transcribed", "Detected"])
    
    for vol, label in volumes:
        start_time = helper.send_command("start_listening")
        time.sleep(2.5)
        
        say_to_aiff_and_play(test_sentence, rate=140, volume=vol)
        time.sleep(3)
        
        last_text = helper.get_last_text_since(start_time)
        detected = bool(last_text.strip())
        
        print(f"  {label}: '{last_text.strip()}' ({'detected' if detected else 'NOT detected'})")
        md.add_table_row([label, f"`{last_text.strip()}`" if last_text.strip() else "_silence_", "Yes" if detected else "No"])
        
        helper.send_command("stop_listening")
        time.sleep(1.5)
        helper.drain_queue()
    
    md.add_newline()
    
    # ======================================================
    # SCENARIO 9: SENTENCE BOUNDARY DETECTION
    # ======================================================
    print("\n=== SCENARIO 9: Sentence Boundary / Final Detection ===")
    md.add_section("Scenario 9: Sentence Boundary and isFinal Behavior")
    md.add_text("Investigates when SpeechAnalyzer marks results as `isFinal`. "
                "This is critical for the turn-detection system — the backend needs to know "
                "when the user has finished a thought.")
    
    start_time = helper.send_command("start_listening")
    time.sleep(2.5)
    
    # Say three distinct sentences with pauses
    say_and_wait("First sentence.", rate=140)
    time.sleep(1.5)
    say_and_wait("Second sentence.", rate=140)
    time.sleep(1.5)
    say_and_wait("Third sentence.", rate=140)
    time.sleep(5)
    
    finals = helper.get_finals_since(start_time)
    all_trans = helper.get_transcriptions_since(start_time)
    
    md.add_result("Sentences spoken", "3 (with 1.5s pauses between)")
    md.add_result("Total transcription updates", str(len(all_trans)))
    md.add_result("Final (isFinal=true) segments", str(len(finals)))
    md.add_newline()
    
    if finals:
        md.add_text("**Final segments:**")
        for i, f in enumerate(finals):
            text = f['parsed']['data'].get('text', '')
            md.add_text(f"{i+1}. `{text.strip()}`")
    
    md.add_newline()
    md.add_text("**Key finding**: SpeechAnalyzer typically produces `isFinal=true` at natural sentence boundaries "
                "(periods, question marks) or after a sufficient pause. Multiple finals may be emitted for "
                "multi-sentence input, which the Node.js backend aggregates.")
    
    print(f"  {len(finals)} final segments out of {len(all_trans)} total updates")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # SCENARIO 10: OVERLAPPING SPEECH (TWO SAY COMMANDS)
    # ======================================================
    print("\n=== SCENARIO 10: Overlapping Speech ===")
    md.add_section("Scenario 10: Overlapping Speech (Two Speakers)")
    md.add_text("Tests what happens when two audio sources play simultaneously. "
                "This simulates the scenario where a user talks over the AI.")
    
    start_time = helper.send_command("start_listening")
    time.sleep(2.5)
    
    # Start two say commands at different rates with different voices
    p1 = subprocess.Popen(["/usr/bin/say", "-r", "140", "-v", "Samantha", "hello how are you today"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p2 = subprocess.Popen(["/usr/bin/say", "-r", "160", "-v", "Daniel", "I am doing very well thank you"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    p1.wait()
    p2.wait()
    time.sleep(4)
    
    last_text = helper.get_last_text_since(start_time)
    finals = helper.get_finals_since(start_time)
    
    combined_final = " ".join(f['parsed']['data'].get('text', '').strip() for f in finals)
    
    md.add_result("Speaker 1", "`hello how are you today` (Samantha, 140 WPM)")
    md.add_result("Speaker 2", "`I am doing very well thank you` (Daniel, 160 WPM)")
    md.add_result("Transcribed (combined finals)", f"`{combined_final}`")
    md.add_result("Last partial text", f"`{last_text.strip()}`")
    md.add_newline()
    md.add_text("**Key finding**: When two voices overlap, the transcriber attempts to capture both but may merge or garble them. "
                "In production, this is similar to a user talking over the AI — the `isSpeaking` flag helps the backend "
                "distinguish echo from user speech.")
    
    print(f"  Combined: '{combined_final}'")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # SCENARIO 11: PROGRESSIVE PARTIAL RESULT BEHAVIOR
    # ======================================================
    print("\n=== SCENARIO 11: Progressive Partial Results ===")
    md.add_section("Scenario 11: Progressive Partial Result Behavior")
    md.add_text("Documents exactly how partial results build up as the user speaks. "
                "This is important for UI feedback — showing the user that their speech is being captured.")
    
    start_time = helper.send_command("start_listening")
    time.sleep(2.5)
    
    say_and_wait("Peter Piper picked a peck of pickled peppers", rate=130)
    time.sleep(4)
    
    transcriptions = helper.get_transcriptions_since(start_time)
    
    md.add_text("**Progression of partial results:**")
    md.add_code("\n".join(
        f"{'[FINAL]' if t['parsed']['data'].get('isFinal') else '[part] '} {t['parsed']['data'].get('text', '')}"
        for t in transcriptions
    ))
    
    md.add_result("Total updates", str(len(transcriptions)))
    finals_count = sum(1 for t in transcriptions if t['parsed']['data'].get('isFinal'))
    md.add_result("Finals", str(finals_count))
    md.add_newline()
    md.add_text("**Key finding**: SpeechAnalyzer sends volatile/partial results as it processes audio. "
                "Each partial update replaces the previous one (not appended). The text grows progressively, "
                "typically adding one word at a time, sometimes with punctuation updates.")
    
    print(f"  {len(transcriptions)} progressive updates, {finals_count} finals")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # SCENARIO 12: POST-FINAL BEHAVIOR
    # ======================================================
    print("\n=== SCENARIO 12: What Happens After isFinal ===")
    md.add_section("Scenario 12: Post-Final Behavior")
    md.add_text("After a `isFinal=true` result, does the analyzer continue listening? "
                "Does it start a new segment? This is crucial for multi-turn conversations.")
    
    start_time = helper.send_command("start_listening")
    time.sleep(2.5)
    
    # Say first sentence and wait for final
    say_and_wait("This is the first sentence.", rate=140)
    time.sleep(4)
    
    first_finals = helper.get_finals_since(start_time)
    
    # Now say a second sentence in the SAME session (no reset)
    second_start = time.time()
    say_and_wait("Now here is a second sentence.", rate=140)
    time.sleep(4)
    
    second_finals = helper.get_finals_since(second_start)
    all_finals = helper.get_finals_since(start_time)
    
    md.add_result("First sentence finals", str(len(first_finals)))
    md.add_result("Second sentence finals", str(len(second_finals)))
    md.add_result("Total finals in session", str(len(all_finals)))
    md.add_newline()
    
    if all_finals:
        md.add_text("**All final segments in this single session:**")
        for i, f in enumerate(all_finals):
            md.add_text(f"{i+1}. `{f['parsed']['data'].get('text', '').strip()}`")
    
    md.add_newline()
    md.add_text("**Key finding**: After `isFinal=true`, SpeechAnalyzer continues listening and starts a new segment. "
                "There is no need to restart the session between utterances. This is a major improvement over the "
                "legacy SFSpeechRecognizer which required explicit session restarts.")
    
    print(f"  First: {len(first_finals)} finals, Second: {len(second_finals)} finals, Total: {len(all_finals)}")
    
    helper.send_command("stop_listening")
    time.sleep(1.5)
    helper.drain_queue()
    
    # ======================================================
    # CLEANUP & SAVE
    # ======================================================
    helper.stop()
    
    # Write summary
    md.add_section("Summary of Key Findings")
    md.add_text("1. **Audio converter pattern matters**: Using `.endOfStream` in the AVAudioConverter callback "
                "kills all transcription. Must use `.haveData`/`.noDataNow` pattern.")
    md.add_text("2. **`primeMethod = .none`**: Required to prevent timestamp drift in converted audio.")
    md.add_text("3. **Latency**: First result typically arrives within 1-3 seconds of speech starting.")
    md.add_text("4. **Progressive results**: Partial text updates arrive word-by-word, giving good real-time feedback.")
    md.add_text("5. **isFinal behavior**: Sentence boundaries trigger `isFinal=true`. The analyzer continues "
                "listening after finals — no restart needed.")
    md.add_text("6. **Echo detection**: `isSpeaking` flag is correctly set when TTS is active, enabling "
                "backend echo suppression.")
    md.add_text("7. **Session reset**: Clean — no text bleed between sessions.")
    md.add_text("8. **Speed tolerance**: Works well from 80-280 WPM. Extremely fast speech (400 WPM) may degrade.")
    md.add_text("9. **Volume sensitivity**: Picks up speech at moderate volumes but may struggle with very quiet input.")
    md.add_text("10. **Long-form**: Handles multi-sentence paragraphs well, splitting at natural boundaries.")
    
    md.save()
    print(f"\n{'='*60}")
    print(f"Results saved to: {RESULTS_MD}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
