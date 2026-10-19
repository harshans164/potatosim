export function StatusBar({ projectName, selectedName, status }: { projectName: string; selectedName?: string; status: string }) {
  return <footer className="status-bar">
    <span className="status-brand">CombustionLab</span><span>Project: {projectName}</span><span className="status-flex">{selectedName ? `Selected: ${selectedName}` : "No selection"}</span><span className="status-message"><i/> {status}</span>
  </footer>;
}
