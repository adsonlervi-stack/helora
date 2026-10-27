// Abrir em nova guia: Ctrl/Cmd/Shift + clique ou clique com a rodinha do mouse.
export const tabUrl = (params) => `${window.location.pathname}?${new URLSearchParams(params)}`;
export const wantsNewTab = (e) => !!e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1);
export const openNewTab = (params) => window.open(tabUrl(params), "_blank", "noopener");
/** Props para um elemento clicável que também abre em nova guia. */
export const newTabHandlers = (params, onOpen) => ({
  onClick: (e) => { if (wantsNewTab(e)) { e.preventDefault(); e.stopPropagation(); openNewTab(params); } else onOpen(e); },
  onAuxClick: (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); openNewTab(params); } },
  onMouseDown: (e) => { if (e.button === 1) e.preventDefault(); }
});
