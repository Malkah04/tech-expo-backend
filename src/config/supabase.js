const { createClient } = require("@supabase/supabase-js");

// used for upload images
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
