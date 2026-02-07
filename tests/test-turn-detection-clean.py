#!/usr/bin/env python3
"""
CLEAN TURN DETECTION TESTS — Reset Between Each Scenario
==========================================================
This version resets the SpeechAnalyzer session between each test
to avoid the "session bleed" issue found in the initial test run.

Each test: reset → start listening → wait → say → wait → analyze → stop
"""

import subprocess
import json
import time
import os
import sys
import threading
from datetime import datetime

HELPER_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "swift-helper", "BubbleVoiceSpeech", ".build", "debug", "BubbleVoiceSpeech"
)

RESULTS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "docs", "Turn-Detection-Clean-Results.md"
)


class SpeechHelper:
    def __init__(self):
        self.process = None
        self.transcriptions = []
        self.running = False
    
    def start(self):
        self.process = subprocess.Popen(
            [HELPER_PATH],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1
        )
        self.running = True
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()
        time.sleep(3)  # Wait for pre-warm
    
    def _read_stdout(self):
        try:
            for line in self.process.stdout:
                line = line.strip()
                if not line: continue
                try:
                    msg = json.loads(line)
                    if msg.get("type") == "transcription_update":
                        d = msg.get("data", {})
                        self.transcriptions.append({
                            "ts": time.time(),
                            "text": d.get("text", ""),
                            "isFinal": d.get("isFinal", False),
                            "audioStart": d.get("audioStartTime", -1),
                            "audioEnd": d.get("audioEndTime", -1),
                            "isSpeaking": d.get("isSpeaking", False)
                        })
                except: pass
        except: pass
    
    def _read_stderr(self):
        try:
            for line in self.process.stderr:
                pass
        except: pass
    
    def cmd(self, t, data=None):
        try:
            self.process.stdin.write(json.dumps({"type": t, "data": data}) + "\n")
            self.process.stdin.flush()
        except: pass
    
    def fresh_listen(self):
        """Stop, clear, and start a fresh listening session."""
        self.cmd("stop_listening")
        time.sleep(1)
        self.transcriptions = []
        self.cmd("start_listening")
        time.sleep(2)  # Wait for analyzer to be ready
    
    def stop(self):
        self.cmd("stop_listening")
        time.sleep(0.5)
        try: self.process.terminate()
        except: pass


def say(text, rate=180):
    subprocess.run(["say", "-r", str(rate), text], capture_output=True)


def run_scenario(helper, name, speech_fn, wait_after=4.0):
    """
    Run a single test scenario with a fresh session.
    Returns (scenario_name, transcription_list, speech_start_time).
    """
    print(f"  [{name}] Resetting session...")
    helper.fresh_listen()
    
    print(f"  [{name}] Speaking...")
    speech_start = time.time()
    speech_fn()
    speech_end = time.time()
    speech_duration = speech_end - speech_start
    
    print(f"  [{name}] Waiting {wait_after}s for transcription to settle...")
    time.sleep(wait_after)
    
    # Snapshot transcriptions
    txns = list(helper.transcriptions)
    
    # Analyze
    result = {
        "name": name,
        "speech_duration": round(speech_duration, 2),
        "total_updates": len(txns),
        "finals": [],
        "last_text": "",
        "first_latency": None,
        "last_relative": None,
        "timeline": []
    }
    
    if txns:
        result["first_latency"] = round(txns[0]["ts"] - speech_start, 3)
        result["last_relative"] = round(txns[-1]["ts"] - speech_start, 3)
        result["last_text"] = txns[-1]["text"]
        result["finals"] = [t["text"] for t in txns if t["isFinal"]]
        
        for t in txns:
            rel = round(t["ts"] - speech_start, 3)
            tag = "FINAL" if t["isFinal"] else "partial"
            audio = ""
            if t["audioEnd"] > 0:
                audio = f" [audio:{t['audioStart']:.1f}-{t['audioEnd']:.1f}s]"
            spk = " [TTS-ACTIVE]" if t["isSpeaking"] else ""
            result["timeline"].append(f"{rel:7.3f}s [{tag:7s}] {t['text'][:60]}{audio}{spk}")
    
    print(f"  [{name}] Got {len(txns)} updates, {len(result['finals'])} finals")
    return result


def write_result(f, r):
    """Write a single result to the markdown file."""
    f.write(f"### {r['name']}\n\n")
    f.write(f"- **Speech duration**: {r['speech_duration']}s\n")
    f.write(f"- **Total updates**: {r['total_updates']}\n")
    
    if r['first_latency'] is not None:
        f.write(f"- **First update latency**: {r['first_latency']}s\n")
        f.write(f"- **Last update**: {r['last_relative']}s after speech start\n")
    
    if r['finals']:
        f.write(f"- **Finals ({len(r['finals'])})**: \n")
        for ft in r['finals']:
            f.write(f"  - `{ft}`\n")
    else:
        f.write(f"- **Finals**: 0 (no finalized segments)\n")
    
    if r['last_text']:
        f.write(f"- **Last text**: `{r['last_text'][:80]}`\n")
    
    # Show timeline (abbreviated)
    if r['timeline']:
        f.write(f"- **Timeline**:\n")
        f.write(f"  ```\n")
        tl = r['timeline']
        for i, line in enumerate(tl):
            if i < 4 or i >= len(tl) - 4 or "FINAL" in line:
                f.write(f"  {line}\n")
            elif i == 4 and len(tl) > 8:
                f.write(f"  ... ({len(tl) - 8} more partials) ...\n")
        f.write(f"  ```\n")
    
    f.write("\n")
    f.flush()


def main():
    print("=" * 60)
    print("CLEAN TURN DETECTION TESTS (with session reset)")
    print("=" * 60)
    
    h = SpeechHelper()
    h.start()
    
    with open(RESULTS_FILE, "w") as f:
        f.write("# Turn Detection — Clean Test Results (Session Reset Between Tests)\n\n")
        f.write(f"**Date**: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Method**: Fresh SpeechAnalyzer session per test (stop → clear → start)\n\n")
        f.write("---\n\n")
        
        # ========================================
        # SECTION 1: TURN LENGTH VARIATIONS
        # ========================================
        f.write("## 1. Turn Length Variations\n\n")
        
        scenarios = [
            ("Single Word: 'Yes'",
             lambda: say("Yes"), 5.0),
            
            ("Single Word: 'Stop'",
             lambda: say("Stop"), 5.0),
            
            ("Two Words: 'OK sure'",
             lambda: say("OK sure"), 4.0),
            
            ("Short Phrase: 'I think so' (3 words)",
             lambda: say("I think so"), 4.0),
            
            ("Medium: 'Can you help me with something' (6 words)",
             lambda: say("Can you help me with something"), 4.0),
            
            ("Sentence: 'I need to schedule a meeting for tomorrow afternoon' (9 words)",
             lambda: say("I need to schedule a meeting for tomorrow afternoon"), 4.0),
            
            ("Long: 'I was thinking we could go to that new restaurant downtown since we have not been there yet' (18 words)",
             lambda: say("I was thinking we could go to that new restaurant downtown since we have not been there yet", rate=160), 5.0),
        ]
        
        for name, fn, wait in scenarios:
            r = run_scenario(h, name, fn, wait)
            write_result(f, r)
        
        # ========================================
        # SECTION 2: SENTENCE BOUNDARIES
        # ========================================
        f.write("\n---\n\n## 2. Sentence Boundary Detection\n\n")
        
        boundary_tests = [
            ("Two sentences: period",
             lambda: say("The sun is shining. It is a beautiful day.", rate=150), 5.0),
            
            ("Two sentences: question + statement",
             lambda: say("How are you doing? I hope you are well.", rate=150), 5.0),
            
            ("Three sentences with exclamation",
             lambda: say("Wow! That is incredible! I love it!", rate=160), 5.0),
            
            ("Long compound sentence (no sentence break)",
             lambda: say("I went to the store and bought some milk and then I came home and made dinner and it was really delicious", rate=160), 5.0),
        ]
        
        for name, fn, wait in boundary_tests:
            r = run_scenario(h, name, fn, wait)
            write_result(f, r)
        
        # ========================================
        # SECTION 3: PAUSE & HESITATION
        # ========================================
        f.write("\n---\n\n## 3. Pauses, Hesitations, and Corrections\n\n")
        f.write("These test whether the timer cascade would fire prematurely.\n\n")
        
        pause_tests = [
            ("0.5s mid-sentence pause (below LLM timer)",
             lambda: (say("I want to"), time.sleep(0.5), say("go to the store")), 5.0),
            
            ("1.0s mid-sentence pause (below LLM timer)",
             lambda: (say("I want to"), time.sleep(1.0), say("go to the store")), 5.0),
            
            ("1.5s mid-sentence pause (above base LLM timer!)",
             lambda: (say("I want to"), time.sleep(1.5), say("go to the store")), 5.0),
            
            ("2.0s mid-sentence pause (well above LLM timer)",
             lambda: (say("I want to"), time.sleep(2.0), say("go to the store")), 6.0),
            
            ("Hesitation with fillers",
             lambda: say("Um, so, like, I was thinking maybe we could try a different approach", rate=130), 6.0),
            
            ("Quick correction",
             lambda: (say("I want the red"), time.sleep(0.3), say("no wait the blue one")), 5.0),
        ]
        
        for name, fn, wait in pause_tests:
            r = run_scenario(h, name, fn, wait)
            write_result(f, r)
        
        # ========================================
        # SECTION 4: INTERRUPTION
        # ========================================
        f.write("\n---\n\n## 4. Interruption Scenarios\n\n")
        f.write("Testing user speech while TTS is active (isSpeaking flag).\n\n")
        
        def interruption_early():
            """User interrupts 1 second into AI speech."""
            h.cmd("speak", {"text": "Let me tell you about the weather forecast for this week", "rate": 180})
            time.sleep(1.0)
            say("Stop, I already know")
            time.sleep(0.5)
            h.cmd("stop_speaking")
        
        def interruption_late():
            """User interrupts 3 seconds into AI speech."""
            h.cmd("speak", {"text": "The process involves several steps that we need to go through carefully", "rate": 160})
            time.sleep(3.0)
            say("Wait, can you slow down")
            time.sleep(0.5)
            h.cmd("stop_speaking")
        
        def interruption_overlap():
            """User speaks simultaneously with AI (overlap)."""
            h.cmd("speak", {"text": "Here is what I think we should do about this situation", "rate": 180})
            time.sleep(0.5)
            say("No no no, that is wrong")
            time.sleep(0.5)
            h.cmd("stop_speaking")
        
        int_tests = [
            ("Early interruption (1s into TTS)", interruption_early, 5.0),
            ("Late interruption (3s into TTS)", interruption_late, 5.0),
            ("Immediate overlap (0.5s into TTS)", interruption_overlap, 5.0),
        ]
        
        for name, fn, wait in int_tests:
            r = run_scenario(h, name, fn, wait)
            write_result(f, r)
            # Check isSpeaking flags
            speaking_txns = [t for t in h.transcriptions if t["isSpeaking"] and t["text"].strip()]
            if speaking_txns:
                f.write(f"  **isSpeaking=true transcriptions**: {len(speaking_txns)}\n")
                for t in speaking_txns[:5]:
                    f.write(f"  - `{t['text'][:50]}` at audio {t['audioStart']:.1f}-{t['audioEnd']:.1f}s\n")
                f.write("\n")
        
        # ========================================
        # SECTION 5: BACK-TO-BACK TURNS
        # ========================================
        f.write("\n---\n\n## 5. Consecutive Turn Simulation\n\n")
        f.write("Simulates a full conversation exchange: user speaks → AI responds → user speaks again.\n\n")
        
        # Turn 1: User
        r1 = run_scenario(h, "Conversation Turn 1 (user)", lambda: say("Tell me about quantum computing"), 4.0)
        write_result(f, r1)
        
        # Simulate AI response
        f.write("*[Simulating AI response via TTS...]*\n\n")
        h.cmd("speak", {"text": "Quantum computing uses quantum bits which can be in superposition.", "rate": 180})
        time.sleep(5.0)
        h.cmd("stop_speaking")
        time.sleep(0.5)
        
        # Reset (as backend would do)
        h.cmd("reset_recognition")
        time.sleep(2.0)
        
        # Turn 2: User follow-up
        h.transcriptions = []
        speech_start_2 = time.time()
        say("That is interesting, tell me more about superposition")
        time.sleep(4.0)
        
        txns_2 = list(h.transcriptions)
        r2 = {
            "name": "Conversation Turn 2 (user follow-up after AI)",
            "speech_duration": round(time.time() - speech_start_2 - 4.0, 2),
            "total_updates": len(txns_2),
            "finals": [t["text"] for t in txns_2 if t["isFinal"]],
            "last_text": txns_2[-1]["text"] if txns_2 else "",
            "first_latency": round(txns_2[0]["ts"] - speech_start_2, 3) if txns_2 else None,
            "last_relative": round(txns_2[-1]["ts"] - speech_start_2, 3) if txns_2 else None,
            "timeline": []
        }
        for t in txns_2:
            rel = round(t["ts"] - speech_start_2, 3)
            tag = "FINAL" if t["isFinal"] else "partial"
            r2["timeline"].append(f"{rel:7.3f}s [{tag:7s}] {t['text'][:60]}")
        
        write_result(f, r2)
        
        # Turn 3: Quick follow-up
        h.cmd("reset_recognition")
        time.sleep(2.0)
        h.transcriptions = []
        
        r3 = run_scenario(h, "Conversation Turn 3 (quick follow-up: 'Yes')", lambda: say("Yes"), 5.0)
        write_result(f, r3)
        
        # ========================================
        # SECTION 6: SPEED VARIATIONS
        # ========================================
        f.write("\n---\n\n## 6. Speech Speed Variations\n\n")
        
        speed_tests = [
            ("Very fast (300 WPM)",
             lambda: say("I need you to quickly find the answer to my question about the project", rate=300), 4.0),
            
            ("Normal (180 WPM)",
             lambda: say("I need you to quickly find the answer to my question about the project", rate=180), 5.0),
            
            ("Slow (100 WPM)",
             lambda: say("I need you to quickly find the answer", rate=100), 6.0),
        ]
        
        for name, fn, wait in speed_tests:
            r = run_scenario(h, name, fn, wait)
            write_result(f, r)
        
        # ========================================
        # SUMMARY
        # ========================================
        f.write("\n---\n\n## Summary Table\n\n")
        f.write("| Scenario | Updates | First Latency | Finals | Turn Duration |\n")
        f.write("| --- | --- | --- | --- | --- |\n")
        # We'll need to collect all results — let me just mark this section
        f.write("*(See individual results above for detailed timing)*\n\n")
    
    h.stop()
    print(f"\nDone! Results: {RESULTS_FILE}")


if __name__ == "__main__":
    main()
