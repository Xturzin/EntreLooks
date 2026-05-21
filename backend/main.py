from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config.settings import settings
from routes.auth import router as auth_router
from routes.clothes import router as clothes_router
from routes.looks import router as looks_router
#from routes.ai import router as ai_router
from routes.style import router as style_router

app = FastAPI(title="EntreLooks API", version="1.0.0")

app.add_middleware(
   CORSMiddleware,
   allow_origins=[settings.FRONTEND_URL],
   allow_credentials=True,
   allow_methods=["*"],
   allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(clothes_router)
app.include_router(looks_router)
#app.include_router(ai_router)
app.include_router(style_router)

@app.get("/")
def root():
   return {"app": "EntreLooks API", "status": "online", "version": "1.0.0"}

@app.get("/health")
def health_check():
   try:
      from services.supabase_service import supabase
      configured = bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)
      return {
         "status": "ok",
         "environment": settings.ENVIRONMENT,
         "supabase": "configured" if configured else "missing credentials"
      }
   except Exception as e:
      return {"status": "error", "detail": str(e)}