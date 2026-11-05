import { supabase } from './supabaseClient.js';

let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
}

// Inicializa e observa o estado da sessão de autenticação
export async function initAuth(onAuthStateChanged) {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;

    currentUser = session?.user || null;
    if (onAuthStateChanged) onAuthStateChanged(currentUser);

    // Escuta mudanças em tempo real (login, logout, refresh de token)
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      if (onAuthStateChanged) onAuthStateChanged(currentUser);
    });

    return currentUser;
  } catch (err) {
    console.error('Erro ao verificar sessão Supabase:', err);
    currentUser = null;
    if (onAuthStateChanged) onAuthStateChanged(null);
    return null;
  }
}

// Cadastro de novo usuário
export async function signUpUser(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    throw new Error(translateAuthError(error.message));
  }

  return data;
}

// Login com e-mail e senha
export async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error(translateAuthError(error.message));
  }

  currentUser = data.user;
  return data;
}

// Logout
export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
  currentUser = null;
}

// Tradução didática das mensagens padrão de erro do Supabase
function translateAuthError(msg) {
  if (!msg) return 'Ocorreu um erro na autenticação.';
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (lower.includes('user already registered')) return 'Este e-mail já está cadastrado no sistema.';
  if (lower.includes('password should be at least')) return 'A senha deve conter no mínimo 6 caracteres.';
  if (lower.includes('email not confirmed')) return 'Por favor, confirme seu e-mail antes de entrar.';
  return msg;
}
