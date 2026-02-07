#!/usr/bin/env python3
"""
============================================================
SHARED TEST UTILITIES FOR NEURAL ENGINE STT BENCHMARKS
============================================================

This module provides the common infrastructure that all
Neural Engine / Apple Silicon STT benchmark tests share.
It includes:
  - Audio generation via macOS `say` command
  - Microphone capture via PyAudio
  - Latency and accuracy measurement
  - Result logging to markdown
  - Color-coded terminal output

WHY THIS EXISTS:
We're benchmarking multiple local STT engines (mlx-whisper,
lightning-whisper-mlx, sherpa-onnx, whisper.cpp+CoreML) to
find which one can achieve real-time transcription on Apple
Silicon with Neural Engine acceleration. All tests need the
same measurement infrastructure so results are comparable.

PATTERN:
This follows the same testing approach used in our existing
test-stt-direct.py and test-stt-comprehensive.py — using
`say` to generate audio through speakers, capturing via mic,
and measuring transcription output. The key difference is
these tests run their OWN transcription engine instead of
the Swift helper process.

DEPENDENCIES:
  pip install pyaudio numpy soundfile
  brew install portaudio  (needed for pyaudio on macOS)

CREATED: 2026-02-07 from research on Neural Engine optimized
models for real-time transcription. User wanted to explore
alternatives to Apple's SpeechAnalyzer and raw whisper.cpp.
============================================================
"""

import subprocess
import time
import os
import sys
import json
import wave
import tempfile
import struct
from datetime import datetime


# ============================================================
# PATHS AND CONFIGURATION
# ============================================================

# All paths are relative to this file's directory so tests
# can be run from anywhere (as long as the project structure
# remains the same). The SCRIPT_DIR/PROJECT_DIR pattern is
# used in all our other test files for consistency.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TESTS_DIR = os.path.dirname(SCRIPT_DIR)
PROJECT_DIR = os.path.dirname(TESTS_DIR)
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
TMP_DIR = os.path.join(PROJECT_DIR, "tmp")
MODELS_DIR = os.path.join(TMP_DIR, "neural-engine-models")

# Audio configuration — matching Whisper's expected input
# format. Whisper models expect 16kHz mono audio. We also
# keep 48kHz for the raw capture since that's the default
# macOS mic sample rate, then resample down to 16kHz.
SAMPLE_RATE_MIC = 48000     # macOS default mic sample rate
SAMPLE_RATE_WHISPER = 16000  # What Whisper models expect
CHANNELS = 1                 # Mono audio for speech
CHUNK_SIZE = 1024            # PyAudio buffer size
FORMAT_BITS = 16             # 16-bit PCM audio

# Timing constants — these are tuned based on our experience
# from test-stt-comprehensive.py. The `say` command takes
# about 0.5-1s to start producing audio, and STT engines
# need varying amounts of time to produce first output.
SAY_WARMUP_DELAY = 0.5      # Wait after starting say before expecting output
POST_SPEECH_WAIT = 3.0       # Wait after say finishes for STT to catch up
SESSION_GAP = 1.5            # Wait between test sessions


# ============================================================
# TERMINAL COLORS
# ============================================================
# Same color scheme as our other test files for visual
# consistency when running tests side by side.

class TerminalColors:
    """ANSI color codes for terminal output.
    
    WHY: Makes test output scannable at a glance —
    green for pass, red for fail, yellow for warnings.
    Same color scheme used in test-stt-direct.py."""
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    CYAN = '\033[0;36m'
    MAGENTA = '\033[0;35m'
    BOLD = '\033[1m'
    NC = '\033[0m'  # No Color / Reset

C = TerminalColors()


# ============================================================
# AUDIO GENERATION (via macOS `say` command)
# ============================================================
# These functions use the macOS text-to-speech system to
# generate test audio. This is the same approach we use
# in all our other STT tests. The audio plays through the
# speakers and gets picked up by the microphone, simulating
# a real user speaking.

def say_and_wait(text, rate=140, voice=None):
    """
    Play text using macOS `say` command and block until done.
    Returns the duration in seconds.
    
    WHY blocking: We need to know exactly when speech ends
    so we can measure latency from speech-end to transcription.
    
    Called by: All test scenarios that need timed speech.
    
    Args:
        text: The text to speak
        rate: Words per minute (default 140 = normal pace)
        voice: macOS voice name (None = system default)
    """
    start = time.time()
    cmd = ["/usr/bin/say", "-r", str(rate)]
    if voice:
        cmd.extend(["-v", voice])
    cmd.append(text)
    proc = subprocess.run(cmd, capture_output=True, timeout=60)
    elapsed = time.time() - start
    return elapsed


def say_to_wav_file(text, output_path, rate=140, voice=None):
    """
    Render speech to a WAV file instead of playing it.
    Useful for tests that need to control playback volume
    or analyze the audio directly.
    
    WHY: Some tests need volume control (afplay -v), and
    some STT engines can transcribe directly from files
    which lets us measure pure inference time separately
    from audio capture time.
    
    Args:
        text: Text to render to speech
        output_path: Where to save the WAV file
        rate: Words per minute
        voice: macOS voice name
    """
    # macOS `say` outputs AIFF by default, we convert to WAV
    aiff_path = output_path.replace('.wav', '.aiff')
    if not aiff_path.endswith('.aiff'):
        aiff_path = output_path + '.aiff'
    
    cmd = ["/usr/bin/say", "-r", str(rate), "-o", aiff_path]
    if voice:
        cmd.extend(["-v", voice])
    cmd.append(text)
    subprocess.run(cmd, capture_output=True, timeout=60)
    
    # Convert AIFF to WAV using afconvert (macOS built-in)
    # We use 16kHz 16-bit mono which is what Whisper expects
    subprocess.run([
        "afconvert", "-f", "WAVE", "-d", "LEI16@16000",
        "-c", "1", aiff_path, output_path
    ], capture_output=True, timeout=60)
    
    # Clean up the intermediate AIFF
    if os.path.exists(aiff_path) and aiff_path != output_path:
        os.unlink(aiff_path)
    
    return output_path


def say_to_aiff_and_play(text, rate=140, volume=0.5):
    """
    Render speech to AIFF then play with volume control.
    Returns the total duration (render + playback) in seconds.
    
    WHY: We need volume control for quiet-speech tests.
    The `say` command doesn't have a volume flag, but
    `afplay` does (via -v). So we render to file first,
    then play at the desired volume.
    
    This is the same approach used in test-stt-comprehensive.py
    scenario 8 (Quiet Speech).
    """
    start = time.time()
    aiff_path = f"/tmp/neural_stt_test_{os.getpid()}.aiff"
    subprocess.run(
        ["/usr/bin/say", "-r", str(rate), "-o", aiff_path, text],
        capture_output=True, timeout=60
    )
    subprocess.run(
        ["afplay", "-v", str(volume), aiff_path],
        capture_output=True, timeout=60
    )
    elapsed = time.time() - start
    # Clean up
    if os.path.exists(aiff_path):
        os.unlink(aiff_path)
    return elapsed


def say_async(text, rate=140, voice=None):
    """
    Play text using macOS `say` without waiting for it to finish.
    Returns the subprocess.Popen object so the caller can
    wait() or kill() as needed.
    
    WHY: Some tests need speech happening while the STT
    engine is actively processing — for latency measurement
    of streaming/realtime transcription.
    """
    cmd = ["/usr/bin/say", "-r", str(rate)]
    if voice:
        cmd.extend(["-v", voice])
    cmd.append(text)
    return subprocess.Popen(
        cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


# ============================================================
# ACCURACY MEASUREMENT
# ============================================================

def word_accuracy(expected, got):
    """
    Calculate word-level accuracy between expected and transcribed text.
    Uses set intersection — order-independent, case-insensitive.
    
    WHY set-based: Whisper and other models may reorder or
    add/remove filler words. We care about whether the key
    content words were captured, not exact ordering. This is
    the same metric used in test-stt-comprehensive.py.
    
    Returns a float 0.0 to 1.0 (1.0 = perfect match).
    """
    # Strip punctuation that STT engines handle inconsistently
    import re
    clean = lambda s: set(re.sub(r'[^\w\s]', '', s.lower()).split())
    
    expected_words = clean(expected)
    got_words = clean(got)
    
    if not expected_words:
        return 0.0
    
    matched = len(expected_words & got_words)
    return matched / len(expected_words)


def word_error_rate(reference, hypothesis):
    """
    Calculate Word Error Rate (WER) using Levenshtein distance
    on word sequences. This is the standard ASR metric.
    
    WHY WER in addition to word_accuracy: WER penalizes
    insertions and substitutions, giving a more nuanced
    view of transcription quality. Word accuracy (above)
    is simpler but doesn't account for extra words the
    model hallucinates.
    
    Lower WER = better. 0.0 = perfect, 1.0 = completely wrong.
    Can exceed 1.0 if there are many insertions.
    """
    import re
    clean = lambda s: re.sub(r'[^\w\s]', '', s.lower()).split()
    
    ref_words = clean(reference)
    hyp_words = clean(hypothesis)
    
    # Dynamic programming for edit distance
    n = len(ref_words)
    m = len(hyp_words)
    
    # dp[i][j] = edit distance between ref[:i] and hyp[:j]
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if ref_words[i-1] == hyp_words[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                dp[i][j] = 1 + min(
                    dp[i-1][j],      # deletion
                    dp[i][j-1],      # insertion
                    dp[i-1][j-1]     # substitution
                )
    
    if n == 0:
        return float(m) if m > 0 else 0.0
    
    return dp[n][m] / n


# ============================================================
# MICROPHONE CAPTURE
# ============================================================

def record_audio_chunk(duration_seconds, sample_rate=SAMPLE_RATE_WHISPER):
    """
    Record audio from the default microphone for a fixed duration.
    Returns a numpy array of float32 samples normalized to [-1, 1].
    
    WHY we return float32: All Whisper variants (mlx-whisper,
    whisper.cpp, sherpa-onnx) expect float32 audio normalized
    to [-1, 1] range. PyAudio gives us int16 which we convert.
    
    IMPORTANT: Requires `pip install pyaudio numpy` and
    `brew install portaudio` on macOS.
    
    Args:
        duration_seconds: How long to record
        sample_rate: Audio sample rate (default 16kHz for Whisper)
    
    Returns:
        numpy array of float32 audio samples
    """
    try:
        import pyaudio
        import numpy as np
    except ImportError:
        print(f"{C.RED}ERROR: pyaudio and numpy required.{C.NC}")
        print("  pip install pyaudio numpy")
        print("  brew install portaudio")
        sys.exit(1)
    
    p = pyaudio.PyAudio()
    
    stream = p.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=sample_rate,
        input=True,
        frames_per_buffer=CHUNK_SIZE
    )
    
    frames = []
    num_chunks = int(sample_rate / CHUNK_SIZE * duration_seconds)
    
    for _ in range(num_chunks):
        data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
        frames.append(data)
    
    stream.stop_stream()
    stream.close()
    p.terminate()
    
    # Convert int16 bytes to float32 numpy array
    audio_data = np.frombuffer(b''.join(frames), dtype=np.int16)
    audio_float = audio_data.astype(np.float32) / 32768.0
    
    return audio_float


def save_audio_to_wav(audio_float32, filepath, sample_rate=SAMPLE_RATE_WHISPER):
    """
    Save a float32 numpy audio array to a WAV file.
    
    WHY: Some STT engines (mlx-whisper) only accept file paths,
    not raw audio arrays. We need to write to a temp WAV file
    and pass the path. This is a limitation of the mlx-whisper
    API which doesn't support streaming audio buffers directly.
    
    Args:
        audio_float32: numpy array of float32 samples
        filepath: Output WAV file path
        sample_rate: Sample rate to write in the WAV header
    """
    import numpy as np
    
    # Convert float32 [-1, 1] back to int16 for WAV format
    audio_int16 = (audio_float32 * 32767).astype(np.int16)
    
    with wave.open(filepath, 'w') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)  # 16-bit = 2 bytes
        wf.setframerate(sample_rate)
        wf.writeframes(audio_int16.tobytes())


# ============================================================
# RESULT LOGGING (MARKDOWN)
# ============================================================

class MarkdownResultWriter:
    """
    Writes benchmark results to a markdown file incrementally.
    
    WHY markdown: Consistent with our existing test result
    files (STT-Comprehensive-Test-Results.md, etc.) in the
    docs/ folder. Markdown renders nicely on GitHub and is
    easy for both humans and AI agents to read.
    
    WHY incremental: Long-running benchmark tests can crash
    or be interrupted. By writing results incrementally, we
    don't lose partial results. This is the same pattern
    used in run-stt-scenarios.sh.
    """
    
    def __init__(self, filepath, title, engine_name):
        """
        Initialize the result writer.
        
        Args:
            filepath: Path to the markdown file to write
            title: Document title
            engine_name: Name of the STT engine being tested
        """
        self.filepath = filepath
        self.engine_name = engine_name
        
        # Ensure the results directory exists
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Write the header immediately
        with open(filepath, 'w') as f:
            f.write(f"# {title}\n\n")
            f.write(f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"**Engine**: {engine_name}\n")
            f.write(f"**Platform**: macOS on Apple Silicon\n")
            f.write(f"**Goal**: Evaluate real-time transcription capability via Neural Engine / MLX\n\n")
            f.write("---\n\n")
    
    def append(self, text):
        """Append raw text to the markdown file."""
        with open(self.filepath, 'a') as f:
            f.write(text)
    
    def add_section(self, title, level=2):
        """Add a section header."""
        prefix = "#" * level
        self.append(f"\n{prefix} {title}\n\n")
    
    def add_text(self, text):
        """Add a paragraph of text."""
        self.append(f"{text}\n\n")
    
    def add_result(self, label, value):
        """Add a key-value result line."""
        self.append(f"- **{label}**: {value}\n")
    
    def add_table_header(self, cols):
        """Add a markdown table header row."""
        self.append("| " + " | ".join(cols) + " |\n")
        self.append("| " + " | ".join(["---"] * len(cols)) + " |\n")
    
    def add_table_row(self, cols):
        """Add a markdown table data row."""
        self.append("| " + " | ".join(str(c) for c in cols) + " |\n")
    
    def add_code(self, text, lang=""):
        """Add a code block."""
        self.append(f"```{lang}\n{text}\n```\n\n")
    
    def add_newline(self):
        """Add a blank line."""
        self.append("\n")


# ============================================================
# TEST SCENARIO RUNNER
# ============================================================

class BenchmarkScenario:
    """
    Defines a single test scenario for an STT engine.
    
    WHY a class: Each scenario has a name, input text, speaking
    rate, and expected behavior. By encapsulating these, we can
    run the same scenarios across all engines and directly compare.
    
    SCENARIOS: These match our existing test-stt-comprehensive.py
    scenarios for cross-comparison with Apple SpeechAnalyzer.
    """
    
    def __init__(self, name, text, rate=140, description="", 
                 pre_speech_delay=0.5, post_speech_wait=3.0):
        self.name = name
        self.text = text
        self.rate = rate
        self.description = description
        self.pre_speech_delay = pre_speech_delay
        self.post_speech_wait = post_speech_wait


# ============================================================
# STANDARD TEST SCENARIOS
# ============================================================
# These are the same phrases we test in our SpeechAnalyzer
# tests, so we can directly compare results across engines.

STANDARD_SCENARIOS = [
    BenchmarkScenario(
        name="Short Word",
        text="hello",
        rate=140,
        description="Single short word — tests minimum latency and warmup."
    ),
    BenchmarkScenario(
        name="Counting 1-10",
        text="one two three four five six seven eight nine ten",
        rate=120,
        description="Sequential numbers — tests progressive recognition and word boundary detection."
    ),
    BenchmarkScenario(
        name="Common Sentence",
        text="The quick brown fox jumps over the lazy dog",
        rate=140,
        description="Classic pangram — tests standard conversational transcription."
    ),
    BenchmarkScenario(
        name="Tongue Twister",
        text="She sells seashells by the seashore",
        rate=140,
        description="Similar-sounding words — tests phonetic discrimination."
    ),
    BenchmarkScenario(
        name="Long Sentence",
        text="How much wood would a woodchuck chuck if a woodchuck could chuck wood",
        rate=140,
        description="Longer utterance with repeated words — tests context and deduplication."
    ),
    BenchmarkScenario(
        name="Technical Terms",
        text="The API returns a JSON response with status code 200",
        rate=140,
        description="Technical/programming vocabulary — tests domain vocabulary coverage."
    ),
    BenchmarkScenario(
        name="Long Paragraph",
        text="Today is a beautiful day. The sun is shining and the birds are singing. "
             "I went to the store and bought some apples bananas and oranges. "
             "Then I came home and made a delicious fruit salad.",
        rate=150,
        description="Multi-sentence paragraph — tests sustained transcription and sentence boundaries.",
        post_speech_wait=5.0
    ),
    BenchmarkScenario(
        name="Fast Speech",
        text="one two three four five six seven eight nine ten",
        rate=280,
        description="Same counting phrase but at 280 WPM — tests handling of rapid speech."
    ),
]


# ============================================================
# LOGGING HELPERS
# ============================================================

def log(msg):
    """
    Print a timestamped log message to both terminal and stdout.
    Same format as our other test files for visual consistency.
    """
    timestamp = time.strftime('%H:%M:%S')
    ms = f"{time.time() % 1:.3f}"[1:]
    formatted = f"[{timestamp}{ms}] {msg}"
    print(formatted)


def log_section(title):
    """Print a prominent section header."""
    print()
    print(f"{C.CYAN}{'='*60}{C.NC}")
    print(f"{C.CYAN}  {title}{C.NC}")
    print(f"{C.CYAN}{'='*60}{C.NC}")


def log_pass(msg):
    """Print a PASS message in green."""
    log(f"{C.GREEN}PASS: {msg}{C.NC}")


def log_fail(msg):
    """Print a FAIL message in red."""
    log(f"{C.RED}FAIL: {msg}{C.NC}")


def log_warn(msg):
    """Print a WARNING message in yellow."""
    log(f"{C.YELLOW}WARNING: {msg}{C.NC}")


def log_info(msg):
    """Print an INFO message in cyan."""
    log(f"{C.CYAN}INFO: {msg}{C.NC}")


# ============================================================
# ENVIRONMENT CHECKS
# ============================================================

def check_pyaudio_available():
    """
    Check if PyAudio is installed and working.
    Returns True if available, False otherwise.
    
    WHY: PyAudio requires portaudio which must be installed
    via brew on macOS. If it's missing, we want to give a
    clear error message rather than a confusing import error.
    """
    try:
        import pyaudio
        # Try to actually instantiate it to check portaudio
        p = pyaudio.PyAudio()
        p.terminate()
        return True
    except ImportError:
        print(f"{C.RED}PyAudio not installed.{C.NC}")
        print(f"  Run: pip install pyaudio")
        print(f"  Also: brew install portaudio")
        return False
    except Exception as e:
        print(f"{C.RED}PyAudio error: {e}{C.NC}")
        print(f"  Try: brew install portaudio && pip install pyaudio")
        return False


def check_numpy_available():
    """Check if numpy is installed."""
    try:
        import numpy
        return True
    except ImportError:
        print(f"{C.RED}numpy not installed. Run: pip install numpy{C.NC}")
        return False


def ensure_directories():
    """Create necessary directories for test artifacts."""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(TMP_DIR, exist_ok=True)


# ============================================================
# ANNOUNCEMENT
# ============================================================

def announce_completion(engine_name, summary):
    """
    Play a soft audio announcement when tests complete.
    
    WHY: The user has accessibility needs and requested
    verbal summaries of test completions. We use the same
    low-volume approach from our .cursorrules — render to
    AIFF then play at 30% volume so it doesn't interfere
    with any calls or other audio.
    """
    try:
        msg = f"Neural Engine S T T benchmark for {engine_name} complete. {summary}"
        aiff_path = "/tmp/neural_stt_announce.aiff"
        subprocess.run(
            ["/usr/bin/say", "-o", aiff_path, msg],
            capture_output=True, timeout=30
        )
        subprocess.run(
            ["afplay", "-v", "0.3", aiff_path],
            capture_output=True, timeout=30
        )
    except Exception:
        pass  # Non-critical — don't fail tests over announcement


if __name__ == "__main__":
    # Quick self-test of the utilities
    print(f"{C.BOLD}Shared Test Utils — Self Check{C.NC}")
    print(f"  Script dir: {SCRIPT_DIR}")
    print(f"  Project dir: {PROJECT_DIR}")
    print(f"  Results dir: {RESULTS_DIR}")
    print(f"  Models dir: {MODELS_DIR}")
    print()
    
    ensure_directories()
    print(f"  {C.GREEN}Directories OK{C.NC}")
    
    print(f"  PyAudio: {'OK' if check_pyaudio_available() else 'MISSING'}")
    print(f"  NumPy: {'OK' if check_numpy_available() else 'MISSING'}")
    
    # Test accuracy functions
    assert word_accuracy("hello world", "hello world") == 1.0
    assert word_accuracy("hello world", "hello") == 0.5
    assert word_error_rate("hello world", "hello world") == 0.0
    print(f"  {C.GREEN}Accuracy functions OK{C.NC}")
    
    print(f"\n{C.GREEN}All self-checks passed.{C.NC}")
