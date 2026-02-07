#!/usr/bin/env python3
"""
TURN DETECTION & INTERRUPTION TEST SUITE
=========================================
Tests the BubbleVoice conversation pipeline's ability to correctly detect:
- Turn start (when user begins speaking)
- Turn end (when user stops speaking → silence triggers timer cascade)
- Interruption (user speaks while AI TTS is active)
- Short utterances (single words that shouldn't be cut off)
- Long pauses mid-sentence (shouldn't trigger premature send)
- Rapid fire exchanges (quick back-and-forth)
- Multiple sentences in one turn
- False starts and corrections

APPROACH:
We spawn the Swift helper directly and simulate conversation scenarios
using the macOS `say` command to generate speech. We measure:
1. Time from speech start to first transcription (STT latency)
2. Time from speech end to when transcription stops updating (turn end)
3. Whether isFinal boundaries align with sentence breaks
4. How the system handles overlapping speech

TIMER SYSTEM UNDER TEST (from VoicePipelineService.js):
- Base timers: LLM=1.2s, TTS=2.2s, Playback=3.2s
- Adaptive delay: +600ms for ≤3 words, +300ms for ≤6 words
- Silence confirmation: 800ms window for short utterances (<6 words or <1.8s)
- Reset on every transcription update (silence = absence of updates)

So effectively:
- ≤3 word utterance: LLM fires at 1.8s, then +800ms confirmation = 2.6s total
- 4-6 word utterance: LLM fires at 1.5s, then +800ms confirmation = 2.3s total
- >6 word utterance: LLM fires at 1.2s, no extra confirmation = 1.2s total
"""

import subprocess
import json
import time
import os
import sys
import threading
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================

HELPER_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "swift-helper", "BubbleVoiceSpeech", ".build", "debug", "BubbleVoiceSpeech"
)

# Results will be written incrementally to this file
RESULTS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "docs", "Turn-Detection-Test-Results.md"
)


# ============================================================
# HELPER PROCESS MANAGEMENT
# ============================================================

class SpeechHelperProcess:
    """
    Manages the Swift helper process lifecycle and IPC.
    Reads transcription_update messages from stdout, logs from stderr.
    """
    def __init__(self):
        self.process = None
        self.transcriptions = []  # List of (timestamp, text, isFinal, audioStart, audioEnd)
        self.events = []  # List of (timestamp, eventType, data)
        self.stdout_thread = None
        self.stderr_thread = None
        self.running = False
        self.listen_start_time = None  # When we sent start_listening
        self.speech_start_time = None  # When we started say command
    
    def start(self):
        """Spawn the Swift helper and start reading output."""
        self.process = subprocess.Popen(
            [HELPER_PATH],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        self.running = True
        self.stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self.stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self.stdout_thread.start()
        self.stderr_thread.start()
        
        # Wait for ready signal
        time.sleep(3)
        print(f"  [Helper] Process started (PID: {self.process.pid})")
    
    def _read_stdout(self):
        """Read JSON messages from stdout."""
        try:
            for line in self.process.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    ts = time.time()
                    msg_type = msg.get("type", "")
                    
                    if msg_type == "transcription_update":
                        data = msg.get("data", {})
                        text = data.get("text", "")
                        is_final = data.get("isFinal", False)
                        audio_start = data.get("audioStartTime", -1)
                        audio_end = data.get("audioEndTime", -1)
                        is_speaking = data.get("isSpeaking", False)
                        self.transcriptions.append((ts, text, is_final, audio_start, audio_end, is_speaking))
                    
                    self.events.append((ts, msg_type, msg.get("data")))
                except json.JSONDecodeError:
                    pass
        except:
            pass
    
    def _read_stderr(self):
        """Read log messages from stderr (for debugging)."""
        try:
            for line in self.process.stderr:
                pass  # Silently consume stderr
        except:
            pass
    
    def send_command(self, cmd_type, data=None):
        """Send a JSON command to the helper via stdin."""
        cmd = json.dumps({"type": cmd_type, "data": data})
        try:
            self.process.stdin.write(cmd + "\n")
            self.process.stdin.flush()
        except:
            pass
    
    def start_listening(self):
        """Start speech recognition and record the timestamp."""
        self.listen_start_time = time.time()
        self.send_command("start_listening")
        # Give the audio engine time to start
        time.sleep(2)
    
    def stop_listening(self):
        """Stop speech recognition."""
        self.send_command("stop_listening")
        time.sleep(1)
    
    def reset_recognition(self):
        """Reset recognition (simulates post-TTS reset)."""
        self.send_command("reset_recognition")
        time.sleep(2)
    
    def start_tts(self, text, rate=200):
        """Start TTS (sets isSpeaking=true in the helper)."""
        self.send_command("speak", {"text": text, "rate": rate})
    
    def stop_tts(self):
        """Stop TTS."""
        self.send_command("stop_speaking")
    
    def clear_transcriptions(self):
        """Clear accumulated transcriptions for a fresh test."""
        self.transcriptions = []
        self.events = []
        self.speech_start_time = None
    
    def stop(self):
        """Kill the helper process."""
        self.running = False
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


def say(text, rate=180):
    """Speak text using macOS say command. Returns when speech finishes."""
    subprocess.run(["say", "-r", str(rate), text], capture_output=True)


def say_async(text, rate=180):
    """Speak text asynchronously. Returns the Process object."""
    return subprocess.Popen(["say", "-r", str(rate), text])


# ============================================================
# TEST ANALYSIS FUNCTIONS
# ============================================================

def analyze_transcriptions(helper, speech_start, speech_text, scenario_name):
    """
    Analyze collected transcriptions to extract timing metrics.
    Returns a dict with metrics about turn detection behavior.
    """
    txns = helper.transcriptions
    if not txns:
        return {
            "scenario": scenario_name,
            "speech_text": speech_text,
            "total_updates": 0,
            "first_update_latency": None,
            "last_update_time": None,
            "silence_after_speech": None,
            "final_count": 0,
            "final_texts": [],
            "last_text": "",
            "all_texts": []
        }
    
    first_ts = txns[0][0]
    last_ts = txns[-1][0]
    
    finals = [(ts, text) for ts, text, is_final, _, _, _ in txns if is_final]
    all_texts = [(ts - speech_start, text, is_final) for ts, text, is_final, _, _, _ in txns]
    
    # Find the last update that had meaningful text
    last_meaningful = None
    for ts, text, is_final, _, _, _ in reversed(txns):
        if text.strip():
            last_meaningful = ts
            break
    
    return {
        "scenario": scenario_name,
        "speech_text": speech_text,
        "total_updates": len(txns),
        "first_update_latency": round(first_ts - speech_start, 3),
        "last_update_relative": round(last_ts - speech_start, 3),
        "silence_after_speech": round(last_ts - speech_start, 3) if last_meaningful else None,
        "final_count": len(finals),
        "final_texts": [text for _, text in finals],
        "last_text": txns[-1][1] if txns else "",
        "audio_timestamps": [(round(astart, 2), round(aend, 2)) 
                           for _, _, _, astart, aend, _ in txns 
                           if aend > 0][-3:] if txns else [],
        "updates_timeline": [(round(ts - speech_start, 3), "FINAL" if is_f else "partial", text[:50])
                            for ts, text, is_f, _, _, _ in txns]
    }


def format_result_markdown(result):
    """Format a single test result as markdown."""
    lines = []
    lines.append(f"#### {result['scenario']}")
    lines.append(f"- **Said**: \"{result['speech_text']}\"")
    lines.append(f"- **Total updates**: {result['total_updates']}")
    
    if result['first_update_latency'] is not None:
        lines.append(f"- **First update latency**: {result['first_update_latency']}s after speech start")
    
    if result.get('last_update_relative') is not None:
        lines.append(f"- **Last update**: {result['last_update_relative']}s after speech start")
    
    lines.append(f"- **Final segments**: {result['final_count']}")
    
    if result['final_texts']:
        for ft in result['final_texts']:
            lines.append(f"  - `{ft}`")
    
    if result.get('last_text'):
        lines.append(f"- **Last text received**: `{result['last_text'][:80]}`")
    
    if result.get('audio_timestamps'):
        lines.append(f"- **Audio timestamps (last 3)**: {result['audio_timestamps']}")
    
    # Show the update timeline (abbreviated)
    if result.get('updates_timeline'):
        lines.append(f"- **Update timeline** (showing key moments):")
        timeline = result['updates_timeline']
        # Show first 3, last 3, and any finals
        shown = set()
        for i, (ts, tag, text) in enumerate(timeline):
            if i < 3 or i >= len(timeline) - 3 or tag == "FINAL":
                lines.append(f"  - `{ts:6.3f}s` [{tag:7s}] {text}")
                shown.add(i)
            elif i == 3 and len(timeline) > 6:
                lines.append(f"  - ... ({len(timeline) - 6} more partial updates) ...")
    
    lines.append("")
    return "\n".join(lines)


# ============================================================
# TEST SCENARIOS
# ============================================================

def run_test(helper, scenario_name, speech_fn, wait_after=3.0):
    """
    Generic test runner:
    1. Clear previous transcriptions
    2. Record speech start time
    3. Execute the speech function (say commands, etc.)
    4. Wait for transcription to settle
    5. Analyze and return results
    """
    print(f"\n  Running: {scenario_name}...")
    helper.clear_transcriptions()
    time.sleep(0.5)
    
    speech_start = time.time()
    helper.speech_start_time = speech_start
    
    # Execute the speech scenario
    speech_fn()
    
    # Wait for transcription to settle
    time.sleep(wait_after)
    
    return speech_start


def test_single_word(helper):
    """Test: Single word utterance like 'Yes' or 'No'."""
    speech_start = run_test(helper, "Single Word: Yes", lambda: say("Yes"))
    return analyze_transcriptions(helper, speech_start, "Yes", "Single Word: 'Yes'")


def test_two_words(helper):
    """Test: Two word utterance."""
    speech_start = run_test(helper, "Two Words: OK sure", lambda: say("OK sure"))
    return analyze_transcriptions(helper, speech_start, "OK sure", "Two Words: 'OK sure'")


def test_short_phrase(helper):
    """Test: Short phrase (3-4 words)."""
    speech_start = run_test(helper, "Short Phrase", lambda: say("I think so"))
    return analyze_transcriptions(helper, speech_start, "I think so", "Short Phrase: 'I think so'")


def test_medium_sentence(helper):
    """Test: Medium sentence (7-10 words)."""
    speech_start = run_test(helper, "Medium Sentence", 
                           lambda: say("Can you tell me what the weather is like today"))
    return analyze_transcriptions(helper, speech_start, 
                                 "Can you tell me what the weather is like today",
                                 "Medium Sentence (10 words)")


def test_long_sentence(helper):
    """Test: Long sentence with natural pauses."""
    text = "I was thinking about going to the store later today to pick up some groceries and maybe stop by the pharmacy on the way back"
    speech_start = run_test(helper, "Long Sentence", lambda: say(text), wait_after=4.0)
    return analyze_transcriptions(helper, speech_start, text, "Long Sentence (25+ words)")


def test_two_sentences(helper):
    """Test: Two sentences in one turn — should produce 2 isFinal segments."""
    text = "The weather is nice today. I think I will go for a walk."
    speech_start = run_test(helper, "Two Sentences", lambda: say(text, rate=160), wait_after=4.0)
    return analyze_transcriptions(helper, speech_start, text, "Two Sentences (should get 2 finals)")


def test_question(helper):
    """Test: Question with rising intonation."""
    speech_start = run_test(helper, "Question", lambda: say("What time does the meeting start?"))
    return analyze_transcriptions(helper, speech_start, 
                                 "What time does the meeting start?",
                                 "Question")


def test_mid_sentence_pause(helper):
    """Test: Long pause in middle of sentence (should NOT trigger premature turn end)."""
    def speak_with_pause():
        say("I was going to say")
        time.sleep(1.5)  # 1.5 second pause (longer than base LLM timer!)
        say("that I really like this approach")
    
    speech_start = run_test(helper, "Mid-Sentence Pause (1.5s)", speak_with_pause, wait_after=4.0)
    return analyze_transcriptions(helper, speech_start,
                                 "I was going to say [1.5s pause] that I really like this approach",
                                 "Mid-Sentence Pause (1.5s gap)")


def test_hesitation(helper):
    """Test: Hesitation with filler words — common in natural speech."""
    text = "Um, so like, I was thinking, you know, maybe we could try something different"
    speech_start = run_test(helper, "Hesitation", lambda: say(text, rate=140), wait_after=4.0)
    return analyze_transcriptions(helper, speech_start, text, "Hesitation with Filler Words")


def test_rapid_correction(helper):
    """Test: Quick correction mid-sentence — user changes their mind."""
    def speak_with_correction():
        say("I want to go to the")
        time.sleep(0.3)
        say("actually never mind, let's stay home")
    
    speech_start = run_test(helper, "Rapid Correction", speak_with_correction, wait_after=4.0)
    return analyze_transcriptions(helper, speech_start,
                                 "I want to go to the [0.3s] actually never mind, let's stay home",
                                 "Rapid Correction (mind change)")


def test_numbers_and_data(helper):
    """Test: Numbers and data dictation — tests auto-formatting."""
    text = "The total is $42.50 and my phone number is 555-123-4567"
    speech_start = run_test(helper, "Numbers/Data", lambda: say(text, rate=150), wait_after=4.0)
    return analyze_transcriptions(helper, speech_start, text, "Numbers and Data (formatting test)")


def test_interruption_simulation(helper):
    """
    Test: Simulate interruption — TTS plays then user speaks over it.
    This tests whether transcriptions during TTS have isSpeaking=true.
    """
    def simulate_interruption():
        # Start TTS via the helper (sets isSpeaking=true)
        helper.start_tts("Let me explain the process to you in detail", rate=180)
        time.sleep(1.5)
        # User "interrupts" by speaking
        say("Wait, stop, I have a question")
        time.sleep(0.5)
        helper.stop_tts()
    
    speech_start = run_test(helper, "Interruption Simulation", simulate_interruption, wait_after=4.0)
    
    # Special analysis: check isSpeaking flag on transcriptions
    speaking_txns = [(ts - speech_start, text, is_speaking) 
                     for ts, text, _, _, _, is_speaking in helper.transcriptions
                     if text.strip()]
    
    result = analyze_transcriptions(helper, speech_start,
                                   "[TTS playing] + 'Wait, stop, I have a question'",
                                   "Interruption (user speaks over TTS)")
    result["speaking_flags"] = speaking_txns[:10]
    return result


def test_back_to_back_turns(helper):
    """
    Test: Simulate two consecutive turns with a reset in between.
    This tests the reset_recognition flow.
    """
    results = []
    
    # Turn 1
    print("  Turn 1...")
    helper.clear_transcriptions()
    speech_start_1 = time.time()
    say("Hello, how are you doing today")
    time.sleep(3.0)
    result_1 = analyze_transcriptions(helper, speech_start_1,
                                      "Hello, how are you doing today",
                                      "Back-to-Back Turn 1")
    results.append(result_1)
    
    # Reset (simulates backend sending reset after AI response)
    print("  Resetting recognition...")
    helper.reset_recognition()
    
    # Turn 2
    print("  Turn 2...")
    helper.clear_transcriptions()
    speech_start_2 = time.time()
    say("That's great, tell me more about it")
    time.sleep(3.0)
    result_2 = analyze_transcriptions(helper, speech_start_2,
                                      "That's great, tell me more about it",
                                      "Back-to-Back Turn 2 (after reset)")
    results.append(result_2)
    
    return results


def test_silence_then_speak(helper):
    """Test: Extended silence followed by speech — tests VAD gate."""
    def speak_after_silence():
        time.sleep(3.0)  # 3 seconds of silence
        say("Now I am speaking after a long silence")
    
    speech_start = run_test(helper, "Silence Then Speak", speak_after_silence, wait_after=4.0)
    return analyze_transcriptions(helper, speech_start,
                                 "[3s silence] Now I am speaking after a long silence",
                                 "Extended Silence Then Speech")


def test_whisper_volume(helper):
    """Test: Very quiet speech — tests VAD energy threshold."""
    speech_start = run_test(helper, "Quiet Speech", 
                           lambda: subprocess.run(
                               ["say", "-r", "140", "[[volm 0.3]]", "This is very quiet speech"],
                               capture_output=True
                           ), wait_after=4.0)
    return analyze_transcriptions(helper, speech_start,
                                 "This is very quiet speech (low volume)",
                                 "Quiet/Whisper Volume Speech")


def test_fast_speech(helper):
    """Test: Very fast speech rate."""
    text = "The quick brown fox jumps over the lazy dog and runs away"
    speech_start = run_test(helper, "Fast Speech", lambda: say(text, rate=280), wait_after=3.0)
    return analyze_transcriptions(helper, speech_start, text, "Fast Speech (280 WPM)")


def test_slow_speech(helper):
    """Test: Very slow speech rate with gaps between words."""
    text = "I am speaking very slowly and carefully"
    speech_start = run_test(helper, "Slow Speech", lambda: say(text, rate=80), wait_after=5.0)
    return analyze_transcriptions(helper, speech_start, text, "Slow Speech (80 WPM)")


def test_emotional_exclamation(helper):
    """Test: Exclamation — tests sentence boundary at '!'."""
    text = "Oh my God! That is amazing! I can not believe it!"
    speech_start = run_test(helper, "Exclamation", lambda: say(text, rate=180), wait_after=4.0)
    return analyze_transcriptions(helper, speech_start, text, 
                                 "Exclamations (3 sentences with '!')")


# ============================================================
# MAIN TEST RUNNER
# ============================================================

def main():
    print("=" * 60)
    print("TURN DETECTION & INTERRUPTION TEST SUITE")
    print("=" * 60)
    print(f"Results will be written to: {RESULTS_FILE}")
    print()
    
    # Initialize results file
    with open(RESULTS_FILE, "w") as f:
        f.write("# Turn Detection & Interruption Test Results\n\n")
        f.write(f"**Date**: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**System**: macOS 26.1, Apple SpeechAnalyzer\n\n")
        f.write("## Timer Configuration Under Test\n\n")
        f.write("| Timer | Base Delay | Adaptive (≤3 words) | Adaptive (4-6 words) | Adaptive (>6 words) |\n")
        f.write("| --- | --- | --- | --- | --- |\n")
        f.write("| LLM Start | 1200ms | +600ms = 1800ms | +300ms = 1500ms | 1200ms |\n")
        f.write("| TTS Start | 2200ms | +600ms = 2800ms | +300ms = 2500ms | 2200ms |\n")
        f.write("| Playback | 3200ms | +600ms = 3800ms | +300ms = 3500ms | 3200ms |\n")
        f.write("| Silence Confirm | 800ms (for ≤6 words or <1.8s utterance) | — | — | — |\n\n")
        f.write("**Key timing**: Turn is considered complete when silence exceeds the LLM timer.\n")
        f.write("For short utterances, an additional 800ms confirmation window is added.\n\n")
        f.write("---\n\n")
    
    helper = SpeechHelperProcess()
    
    try:
        print("Starting Swift helper...")
        helper.start()
        
        print("Starting speech recognition...")
        helper.start_listening()
        
        all_results = []
        
        # ==========================================
        # SECTION 1: Basic Turn Length Variations
        # ==========================================
        section = "## Section 1: Turn Length Variations\n\n"
        section += "Testing how different utterance lengths affect turn detection timing.\n\n"
        
        tests_basic = [
            ("test_single_word", test_single_word),
            ("test_two_words", test_two_words),
            ("test_short_phrase", test_short_phrase),
            ("test_medium_sentence", test_medium_sentence),
            ("test_long_sentence", test_long_sentence),
            ("test_two_sentences", test_two_sentences),
        ]
        
        for name, test_fn in tests_basic:
            result = test_fn(helper)
            all_results.append(result)
            section += format_result_markdown(result)
            # Write incrementally
            with open(RESULTS_FILE, "a") as f:
                if name == tests_basic[0][0]:
                    f.write(section)
                    section = ""
                else:
                    f.write(format_result_markdown(result))
        
        # ==========================================
        # SECTION 2: Natural Speech Patterns
        # ==========================================
        with open(RESULTS_FILE, "a") as f:
            f.write("\n---\n\n## Section 2: Natural Speech Patterns\n\n")
            f.write("Testing realistic speech patterns: pauses, hesitations, corrections.\n\n")
        
        tests_natural = [
            ("test_question", test_question),
            ("test_mid_sentence_pause", test_mid_sentence_pause),
            ("test_hesitation", test_hesitation),
            ("test_rapid_correction", test_rapid_correction),
            ("test_numbers_and_data", test_numbers_and_data),
        ]
        
        for name, test_fn in tests_natural:
            result = test_fn(helper)
            all_results.append(result)
            with open(RESULTS_FILE, "a") as f:
                f.write(format_result_markdown(result))
        
        # ==========================================
        # SECTION 3: Speed Variations
        # ==========================================
        with open(RESULTS_FILE, "a") as f:
            f.write("\n---\n\n## Section 3: Speech Speed Variations\n\n")
            f.write("Testing how different speech rates affect detection.\n\n")
        
        tests_speed = [
            ("test_fast_speech", test_fast_speech),
            ("test_slow_speech", test_slow_speech),
        ]
        
        for name, test_fn in tests_speed:
            result = test_fn(helper)
            all_results.append(result)
            with open(RESULTS_FILE, "a") as f:
                f.write(format_result_markdown(result))
        
        # ==========================================
        # SECTION 4: Edge Cases
        # ==========================================
        with open(RESULTS_FILE, "a") as f:
            f.write("\n---\n\n## Section 4: Edge Cases\n\n")
            f.write("Testing boundary conditions and special patterns.\n\n")
        
        tests_edge = [
            ("test_silence_then_speak", test_silence_then_speak),
            ("test_emotional_exclamation", test_emotional_exclamation),
        ]
        
        for name, test_fn in tests_edge:
            result = test_fn(helper)
            all_results.append(result)
            with open(RESULTS_FILE, "a") as f:
                f.write(format_result_markdown(result))
        
        # ==========================================
        # SECTION 5: Interruption
        # ==========================================
        with open(RESULTS_FILE, "a") as f:
            f.write("\n---\n\n## Section 5: Interruption Detection\n\n")
            f.write("Testing user speaking while AI TTS is active.\n\n")
        
        result_int = test_interruption_simulation(helper)
        all_results.append(result_int)
        with open(RESULTS_FILE, "a") as f:
            f.write(format_result_markdown(result_int))
            if result_int.get("speaking_flags"):
                f.write("- **isSpeaking flags during transcription**:\n")
                for ts, text, is_speaking in result_int["speaking_flags"]:
                    flag = "SPEAKING" if is_speaking else "not speaking"
                    f.write(f"  - `{ts:.3f}s` [{flag}] {text[:50]}\n")
                f.write("\n")
        
        # ==========================================
        # SECTION 6: Session Reset (Back-to-Back Turns)
        # ==========================================
        with open(RESULTS_FILE, "a") as f:
            f.write("\n---\n\n## Section 6: Back-to-Back Turns (Session Reset)\n\n")
            f.write("Testing consecutive turns with reset_recognition between them.\n\n")
        
        results_b2b = test_back_to_back_turns(helper)
        for result in results_b2b:
            all_results.append(result)
            with open(RESULTS_FILE, "a") as f:
                f.write(format_result_markdown(result))
        
        # ==========================================
        # ANALYSIS & RECOMMENDATIONS
        # ==========================================
        with open(RESULTS_FILE, "a") as f:
            f.write("\n---\n\n## Analysis & Findings\n\n")
            
            # Latency analysis
            latencies = [(r["scenario"], r["first_update_latency"]) 
                        for r in all_results if r.get("first_update_latency")]
            if latencies:
                avg_latency = sum(l for _, l in latencies) / len(latencies)
                min_lat = min(latencies, key=lambda x: x[1])
                max_lat = max(latencies, key=lambda x: x[1])
                f.write("### First Update Latency\n\n")
                f.write(f"- **Average**: {avg_latency:.3f}s\n")
                f.write(f"- **Fastest**: {min_lat[1]:.3f}s ({min_lat[0]})\n")
                f.write(f"- **Slowest**: {max_lat[1]:.3f}s ({max_lat[0]})\n\n")
            
            # Final segment analysis
            f.write("### Sentence Boundary Detection (isFinal)\n\n")
            for r in all_results:
                if r.get("final_count", 0) > 0:
                    f.write(f"- **{r['scenario']}**: {r['final_count']} final(s) — {r['final_texts'][:3]}\n")
            f.write("\n")
            
            # Turn end timing
            f.write("### Turn End Timing (last update relative to speech start)\n\n")
            f.write("This tells us how long after speech starts the last transcription arrives.\n")
            f.write("The timer cascade starts AFTER this point.\n\n")
            f.write("| Scenario | Last Update | Word Count | Expected Timer |\n")
            f.write("| --- | --- | --- | --- |\n")
            for r in all_results:
                if r.get("last_update_relative"):
                    wc = len(r["speech_text"].split()) if r["speech_text"] else 0
                    if wc <= 3:
                        timer = "1.8s + 0.8s confirm = 2.6s"
                    elif wc <= 6:
                        timer = "1.5s + 0.8s confirm = 2.3s"
                    else:
                        timer = "1.2s (no confirm)"
                    f.write(f"| {r['scenario'][:40]} | {r['last_update_relative']:.3f}s | {wc} | {timer} |\n")
            f.write("\n")
        
        print(f"\n{'=' * 60}")
        print(f"ALL TESTS COMPLETE — Results written to:")
        print(f"  {RESULTS_FILE}")
        print(f"{'=' * 60}")
        
    finally:
        helper.stop_listening()
        time.sleep(1)
        helper.stop()


if __name__ == "__main__":
    main()
