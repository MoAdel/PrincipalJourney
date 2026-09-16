#!/usr/bin/env python3
"""
THE ARCHITECT: Midnight Blackout — Automated Movie Rendering Pipeline
Stitches AI image stills, synthesized character voices, cinematic camera pan/zooms,
and dual-language subtitles (English + Arabic) into a master MP4 video using FFmpeg.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# Fix Windows console UTF-8 output
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent.parent
SUBTITLES_FILE = BASE_DIR / "subtitles" / "the_architect_warroom_en_ar.srt"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = BASE_DIR / "temp"

SCENES = [
    {
        "id": "scene_01",
        "title": "The Black Friday Crisis",
        "voice": "Microsoft Zira Desktop", # Elena
        "text": "Alert! Cluster East-1 is dropping offline. 42 of 64 pods reported unhealthy. The ingress is throwing 503 Service Unavailable!",
        "duration": 9
    },
    {
        "id": "scene_02",
        "title": "The Death Spiral Diagnosis",
        "voice": "Microsoft David Desktop", # Tarek
        "text": "Do not scale! The liveness probe is executing select one from users with no timeout. Liveness must be pure in-memory!",
        "duration": 10
    },
    {
        "id": "scene_03",
        "title": "The 30GB Memory Leak",
        "voice": "Microsoft David Desktop", # Tarek
        "text": "String interpolation in the hot path and throwing exceptions for business validation burns thousands of CPU cycles. Use Domain Result and zero-allocation logging.",
        "duration": 11
    },
    {
        "id": "scene_04",
        "title": "The Keyset Pagination Rescue",
        "voice": "Microsoft David Desktop", # Tarek
        "text": "Offset 750,000 forces the database to read 750,000 rows into tempdb. Keyset seek converts O of N disk scans into an instant O of 1 leaf seek!",
        "duration": 11
    },
    {
        "id": "scene_05",
        "title": "The Architectural Invariant Victory",
        "voice": "Microsoft David Desktop", # Tarek
        "text": "Never compromise domain boundaries for a quick hotfix. Automated architecture tests never sleep. Protect the core, and the system will protect you.",
        "duration": 10
    }
]

def check_dependencies():
    """Verify ffmpeg is accessible."""
    if not shutil.which("ffmpeg"):
        print("[ERROR] FFmpeg is not found in PATH. Please install FFmpeg.")
        sys.exit(1)
    print("[OK] FFmpeg detected.")

def generate_voice_track(scene_id, voice_name, text, out_wav):
    """Generate audio voiceover using Windows System.Speech."""
    ps_script = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('{voice_name}')
$synth.Rate = 0
$synth.SetOutputToWaveFile('{out_wav.as_posix()}')
$synth.Speak('{text}')
$synth.Dispose()
"""
    cmd = ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not out_wav.exists():
        print(f"[WARN] Failed to synthesize voice for {scene_id}, falling back to silent audio.")
        # Generate silent audio via ffmpeg
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "8", str(out_wav)], check=True)
    else:
        print(f"[OK] Voice generated for {scene_id} ({voice_name}).")

def generate_scene_image(scene_id, out_img, title):
    """Generate or fallback to a cinematic color card if AI image is not yet rendered."""
    custom_img = BASE_DIR / f"{scene_id}.jpg"
    if custom_img.exists():
        shutil.copy(custom_img, out_img)
        print(f"[OK] Using photorealistic scene art for {scene_id}.")
        return

    # Create dark cinematic background image with ffmpeg
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=0x060913:s=1920x1080:d=1",
        "-vframes", "1",
        str(out_img)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[OK] Scene canvas initialized for {scene_id}.")

def render_scene_clip(scene_img, scene_audio, out_mp4, duration):
    """Render single clip with cinematic Ken Burns zoom and audio."""
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(scene_img),
        "-i", str(scene_audio),
        "-vf", f"scale=1920:1080,zoompan=z='min(zoom+0.0012,1.15)':d={duration*25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080",
        "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_mp4)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"[OK] Rendered clip: {out_mp4.name}")

def main():
    check_dependencies()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    print("\n🎬 --- RENDERING 'THE ARCHITECT: MIDNIGHT BLACKOUT' ---")
    clip_files = []

    for sc in SCENES:
        sid = sc["id"]
        wav_path = TEMP_DIR / f"{sid}_voice.wav"
        img_path = TEMP_DIR / f"{sid}_frame.png"
        clip_path = TEMP_DIR / f"{sid}_clip.mp4"

        generate_voice_track(sid, sc["voice"], sc["text"], wav_path)
        generate_scene_image(sid, img_path, sc["title"])
        render_scene_clip(img_path, wav_path, clip_path, sc["duration"])
        clip_files.append(clip_path)

    # Create concat list
    concat_list = TEMP_DIR / "concat_list.txt"
    with open(concat_list, "w", encoding="utf-8") as f:
        for clip in clip_files:
            f.write(f"file '{clip.as_posix()}'\n")

    master_raw = TEMP_DIR / "master_raw.mp4"
    print("\n[STITCH] Concatenating all scenes into master cut...")
    cmd_concat = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list),
        "-c", "copy",
        str(master_raw)
    ]
    subprocess.run(cmd_concat, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    # Burn subtitles if available
    final_output = OUTPUT_DIR / "The_Architect_Midnight_Blackout_Master.mp4"
    if SUBTITLES_FILE.exists():
        print("[SUBTITLES] Burning dual-language Arabic & English subtitles into video stream...")
        sub_escaped = str(SUBTITLES_FILE).replace("\\", "/").replace(":", "\\:")
        cmd_sub = [
            "ffmpeg", "-y", "-i", str(master_raw),
            "-vf", f"subtitles='{sub_escaped}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=4,Outline=2,Alignment=2,MarginV=30'",
            "-c:a", "copy",
            str(final_output)
        ]
        res = subprocess.run(cmd_sub, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode != 0:
            print("[WARN] Subtitle burn filter encountered font issue, copying raw master instead.")
            shutil.copy(master_raw, final_output)
    else:
        shutil.copy(master_raw, final_output)

    print(f"\n🎉 [SUCCESS] The master movie has been rendered successfully!\nSaved to: {final_output}\n")

if __name__ == "__main__":
    main()
