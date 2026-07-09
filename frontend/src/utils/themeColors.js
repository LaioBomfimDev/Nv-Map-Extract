// Cores e preferências dos temas do Mapa.
// O "tema" de um lead vem da keyword da busca que o trouxe (ex.: "clínicas",
// "academias"). Cada tema ganha uma cor automaticamente na primeira vez que
// aparece; o usuário pode renomear, trocar a cor ou ocultar pela legenda.
// As preferências ficam salvas no localStorage (resposta imediata) e, quando o
// usuário está autenticado, sincronizadas no Supabase pela aba Mapa.

// Paleta escolhida para bom contraste sobre o mapa escuro (CartoDB dark).
export const THEME_PALETTE = [
  '#3b82f6', // azul
  '#ef4444', // vermelho
  '#f59e0b', // âmbar
  '#a855f7', // roxo
  '#ec4899', // rosa
  '#14b8a6', // teal
  '#84cc16', // lima
  '#f97316', // laranja
  '#06b6d4', // ciano
  '#eab308', // ouro
  '#8b5cf6', // violeta
  '#f43f5e', // rose
];

// Chave normalizada do tema (para agrupar variações de caixa/espaço).
export function themeKeyOf(keyword) {
  const k = (keyword || '').trim().toLowerCase();
  return k || 'sem-tema';
}

// Rótulo exibido do tema (mantém o texto original da keyword).
export function themeLabelOf(keyword) {
  const k = (keyword || '').trim();
  return k || 'Sem tema';
}

export const THEME_PREFS_KEY = 'mapa_theme_prefs_v1';

// Formato salvo: { [themeKey]: { color, label, hidden } }
export function loadThemePrefs() {
  try {
    return JSON.parse(localStorage.getItem(THEME_PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveThemePrefs(prefs) {
  try {
    localStorage.setItem(THEME_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage indisponível — segue sem persistir */
  }
}
