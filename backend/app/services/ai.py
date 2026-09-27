import json
import io
import wave

from uuid import uuid4
from typing import Literal

from fastapi import HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ..config import settings

# =========================
# SYSTEM PROMPT
# =========================
SYSTEM_PROMPT = """
You are WeatherGPT, an AI weather assistant.

RULES:
- Reply in the SAME language as the user's message.
- If the user writes in Hindi, answer in Hindi (Devanagari).
- If the user writes in English, answer in English.
- If the user mixes Hindi + English, reply naturally in Hinglish.
- Use the provided weather data while answering.
- Keep answers concise and practical.
"""

client = genai.Client(api_key=settings.gemini_api_key)


class Answer(BaseModel):
    explanation: str
    risk_level: Literal["Low", "Moderate", "High", "Severe", "Unknown"]
    confidence_percent: int = Field(ge=0, le=100)
    recommendation: str
    uncertainty: str
    sources: list[str]


async def chat(request, user, weather_data=None):
    if not settings.gemini_api_key:
        raise HTTPException(503, "GEMINI_API_KEY missing")

    weather_context = ""

    if weather_data:
        current = weather_data.get("current", {})
        weather_context = f"""
Live Weather:
Temperature: {current.get('temperature_2m', 'N/A')}°C
Wind Speed: {current.get('wind_speed_10m', 'N/A')} km/h
"""

    prompt = f"""{SYSTEM_PROMPT}

{weather_context}

User Question:
{request.message}
"""

    try:
        response = client.models.generate_content(
            model=f"models/{settings.gemini_model}",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=Answer,
            ),
        )

        ans = response.parsed

        return {
            "explanation": ans.explanation,
            "risk_level": ans.risk_level,
            "confidence_percent": ans.confidence_percent,
            "recommendation": ans.recommendation,
            "uncertainty": ans.uncertainty,
            "sources": ans.sources,
            "conversation_id": str(uuid4()),
            "tools_used": [
                {"name": "Gemini AI", "ok": True},
                {"name": "Weather Data", "ok": True},
            ],
            "confidence_note": "Generated using Gemini",
        }

    except Exception as e:
        raise HTTPException(502, f"Gemini Error: {str(e)}")

async def text_to_speech(text: str):
    try:
        response = client.models.generate_content(
            model="models/gemini-2.5-flash-preview-tts",
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=settings.gemini_tts_voice
                        )
                    )
                ),
            ),
        )

        # Gemini SDK already returns raw PCM bytes
        pcm_data = response.candidates[0].content.parts[0].inline_data.data

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(pcm_data)

        return wav_buffer.getvalue()

    except Exception as e:
        raise HTTPException(500, f"TTS Error: {str(e)}")

async def agricultural_narrative(result: dict) -> str:
    """
    Generate AI explanation for Farmer Mode
    """
    if not settings.gemini_api_key:
        return "AI agricultural advice is unavailable."

    prompt = f"""
You are WeatherGPT's Agriculture Expert.

Write a practical farming recommendation in the SAME language as the user.
If the data is from India, natural Hinglish is acceptable.

Field Analysis:
{json.dumps(result, indent=2)}

Give:
1. Overall crop outlook
2. Irrigation advice
3. Weather risk
4. Action for the next 7 days

Keep it under 180 words.
"""

    try:
        response = client.models.generate_content(
            model=f"models/{settings.gemini_model}",
            contents=prompt,
        )

        return response.text.strip()

    except Exception:
        return "AI farming recommendation could not be generated."