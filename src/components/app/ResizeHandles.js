import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class ResizeHandles extends LitElement {
  constructor() {
    super();
    this._activeEdge = null;
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  _startResize(edge, event) {
    if (event.button !== 0 || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    this._activeEdge = edge;
    ipcRenderer.send('window-manual-resize-start', {
      edge,
      startX: event.screenX,
      startY: event.screenY,
    });
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp, { once: true });
  }

  _onPointerMove(event) {
    if (!this._activeEdge || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('window-manual-resize-step', {
      edge: this._activeEdge,
      dx: event.screenX,
      dy: event.screenY,
    });
  }

  _onPointerUp() {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('window-manual-resize-end');
    }
    this._activeEdge = null;
    window.removeEventListener('pointermove', this._onPointerMove);
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99999;
    }
    .handle {
      position: absolute;
      pointer-events: auto;
      background: var(--accent, #3B82F6);
      opacity: 0.7;
      border-radius: 2px;
      transition: opacity 0.15s;
    }
    .handle:hover {
      opacity: 1;
    }
    .handle-h {
      height: 8px;
      left: 0;
      right: 0;
      cursor: ns-resize;
    }
    .handle-v {
      width: 8px;
      top: 0;
      bottom: 0;
      cursor: ew-resize;
    }
    .handle-t { top: -4px; }
    .handle-b { bottom: -4px; }
    .handle-l { left: -4px; }
    .handle-r { right: -4px; }
    .handle-corner {
      width: 16px;
      height: 16px;
      z-index: 100000;
      background: var(--accent, #3B82F6);
      opacity: 0.9;
      cursor: nwse-resize;
    }
    .handle-tl { top: -8px; left: -8px; cursor: nwse-resize; }
    .handle-tr { top: -8px; right: -8px; cursor: nesw-resize; }
    .handle-bl { bottom: -8px; left: -8px; cursor: nesw-resize; }
    .handle-br { bottom: -8px; right: -8px; cursor: nwse-resize; }
  `;

  render() {
    return html`
      <div class="handle handle-h handle-t" @pointerdown=${(e) => this._startResize('t', e)}></div>
      <div class="handle handle-h handle-b" @pointerdown=${(e) => this._startResize('b', e)}></div>
      <div class="handle handle-v handle-l" @pointerdown=${(e) => this._startResize('l', e)}></div>
      <div class="handle handle-v handle-r" @pointerdown=${(e) => this._startResize('r', e)}></div>
      <div class="handle handle-corner handle-tl" @pointerdown=${(e) => this._startResize('tl', e)}></div>
      <div class="handle handle-corner handle-tr" @pointerdown=${(e) => this._startResize('tr', e)}></div>
      <div class="handle handle-corner handle-bl" @pointerdown=${(e) => this._startResize('bl', e)}></div>
      <div class="handle handle-corner handle-br" @pointerdown=${(e) => this._startResize('br', e)}></div>
    `;
  }
}

customElements.define('resize-handles', ResizeHandles);
