import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://zcbvihahgaqwivvnxufr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjYnZpaGFoZ2Fxd2l2dm54dWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjY1MDA0NTksImV4cCI6MjA0MjA3NjQ1OX0.FWjL--CiHBBH_m8HNeuoUlDPputhKeFG9eS4MUwa7IE';


// Storage Adapter for Chrome Extensions
const storageAdapter = {
  getItem: (key) => {
    if (!key || typeof key !== 'string') {
      console.error(`Invalid key provided to getItem: ${key}`);
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key] || null);
        }
      });
    });
  },
  setItem: (key, value) => {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(true);
        }
      });
    });
  },
  removeItem: (key) => {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.remove(key, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(true);
        }
      });
    });
  },
};
  
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: storageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
