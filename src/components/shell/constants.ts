/**
 * Constantes do shell compartilhadas entre o layout (servidor) e os
 * componentes de cliente. Sem "use client": o layout lê o cookie no servidor
 * para a sidebar já nascer na largura certa, sem salto na hidratação.
 */

export const SIDEBAR_COOKIE = "prontuario.sidebar"
export const SIDEBAR_COLLAPSED_VALUE = "collapsed"
/** Um ano: preferência de interface, não sessão. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Alvo do portal da ação primária da página na barra de contexto. */
export const CONTEXT_ACTIONS_ID = "context-bar-actions"
