// Supabase configuration
const SUPABASE_CONFIG = {
  url: "", // Will be set by user
  anonKey: "", // Will be set by user
};

// Check if config exists in localStorage
const savedConfig = localStorage.getItem("supabaseConfig");
if (savedConfig) {
  const config = JSON.parse(savedConfig);
  SUPABASE_CONFIG.url = config.url;
  SUPABASE_CONFIG.anonKey = config.anonKey;
}
