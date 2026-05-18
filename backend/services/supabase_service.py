from supabase import create_client, Client
from config.settings import settings

# cliente único, importado por toda a aplicação
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)