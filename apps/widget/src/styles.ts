// Inlined CSS string. We inject this into <head> at runtime so the entire widget
// ships as a single .js file (no separate .css to host).

export const widgetCSS = `
.leadflow-widget,
.leadflow-widget * {
  box-sizing: border-box;
}

.leadflow-widget {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483600;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  color: #1a1d24;
  line-height: 1.45;
}

.leadflow-launcher {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: #4f46e5;
  color: white;
  font-size: 26px;
  cursor: pointer;
  box-shadow: 0 6px 24px rgba(79, 70, 229, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.leadflow-launcher:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(79, 70, 229, 0.4);
}

.leadflow-panel {
  width: 360px;
  height: 540px;
  max-height: calc(100vh - 40px);
  background: white;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 480px) {
  .leadflow-widget { right: 12px; bottom: 12px; left: 12px; }
  .leadflow-panel { width: 100%; height: 80vh; }
}

.leadflow-header {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: white;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.leadflow-title { font-weight: 600; flex: 1; }
.leadflow-controls { display: flex; gap: 6px; align-items: center; }
.leadflow-controls select {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
}
.leadflow-controls select option { color: black; }
.leadflow-controls button {
  background: transparent;
  color: white;
  border: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.leadflow-controls button:hover { opacity: 0.85; }

.leadflow-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fafbfc;
}

.leadflow-msg {
  padding: 9px 13px;
  border-radius: 14px;
  max-width: 80%;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.45;
}
.leadflow-msg-user {
  background: #4f46e5;
  color: white;
  align-self: flex-end;
  border-bottom-right-radius: 4px;
}
.leadflow-msg-assistant {
  background: white;
  color: #1a1d24;
  align-self: flex-start;
  border: 1px solid #e4e6eb;
  border-bottom-left-radius: 4px;
}
.leadflow-msg-error {
  background: #fee2e2;
  color: #991b1b;
  align-self: stretch;
  text-align: center;
  font-size: 12px;
  border-radius: 6px;
}

.leadflow-typing {
  align-self: flex-start;
  color: #5c6470;
  font-size: 12px;
  font-style: italic;
  padding-left: 8px;
}

.leadflow-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #e4e6eb;
  background: white;
}
.leadflow-input input {
  flex: 1;
  padding: 9px 12px;
  border: 1px solid #e4e6eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  font-family: inherit;
}
.leadflow-input input:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}
.leadflow-input button {
  padding: 9px 16px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.leadflow-input button:hover { background: #4338ca; }
.leadflow-input button:disabled { opacity: 0.5; cursor: not-allowed; }

.leadflow-footer {
  padding: 6px 12px;
  text-align: center;
  font-size: 11px;
  color: #94a3b8;
  background: white;
  border-top: 1px solid #f1f3f5;
}
.leadflow-footer a { color: #94a3b8; text-decoration: none; }
`;
