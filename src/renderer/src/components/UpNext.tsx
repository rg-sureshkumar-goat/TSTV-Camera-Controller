export function UpNext(): React.JSX.Element {
  return (
    <div className="panel upnext">
      <div className="panel-title">Up Next Playlist</div>
      <div className="upnext-list">
        <div className="drop-zone">+ Drag an angle here</div>
        <div className="muted small center">The playlist arrives in Checkpoint 7.</div>
      </div>
      <button className="btn primary switch" disabled title="Arrives in Checkpoint 7">
        Switch Camera
      </button>
      <div className="muted small center">Runs the top item, then the list moves up</div>
    </div>
  )
}
