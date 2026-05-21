from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
   SUPABASE_URL:      str = os.getenv("SUPABASE_URL", "")
   SUPABASE_KEY:      str = os.getenv("SUPABASE_KEY", "")
   SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
   GROQ_API_KEY:      str = os.getenv("GROQ_API_KEY", "")
   ENVIRONMENT:       str = os.getenv("ENVIRONMENT", "development")
   FRONTEND_URL:      str = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

settings = Settings()