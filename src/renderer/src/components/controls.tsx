import { useEffect, useRef, useState } from 'react'

/**
 * While a control is held, also release it on ANY pointer/mouse-up anywhere,
 * a cancelled pointer, or the window losing focus/visibility, in case the
 * control itself never hears its own pointer-up.
 */
function useReleaseEverywhere(held: React.MutableRefObject<boolean>, release: () => void): (on: boolean) => void {
  const releaseRef = useRef(release)
  releaseRef.current = release
  const handler = useRef(() => {
    if (held.current) releaseRef.current()
  })
  // Only the WINDOW losing focus counts. (A button losing focus when the joystick is
  // pressed also fires 'blur', and must not release the control that was just pressed.)
  const onWindowBlur = useRef((e: FocusEvent) => {
    if (e.target === window && held.current) releaseRef.current()
  })
  const onVisibility = useRef(() => {
    if (document.hidden && held.current) releaseRef.current()
  })
  const attached = useRef(false)
  const set = (on: boolean): void => {
    if (on === attached.current) return
    attached.current = on
    const f = on ? window.addEventListener.bind(window) : window.removeEventListener.bind(window)
    for (const type of ['pointerup', 'mouseup', 'pointercancel']) f(type, handler.current, true)
    if (on) window.addEventListener('blur', onWindowBlur.current)
    else window.removeEventListener('blur', onWindowBlur.current)
    if (on) document.addEventListener('visibilitychange', onVisibility.current)
    else document.removeEventListener('visibilitychange', onVisibility.current)
  }
  useEffect(() => () => set(false), [])
  return set
}

/** While a control is held, re-confirm it this often (main process stops everything after 700 ms of silence). */
const KEEPALIVE_MS = 200

/**
 * Round on-screen joystick for pan/tilt. Drag the knob; let go and it springs
 * back to the centre and the camera stops. Losing the pointer for any reason
 * (window switch, touch cancel) also stops.
 */
export function Joystick({
  disabled,
  onMove,
  onStop
}: {
  disabled: boolean
  onMove: (pan: number, tilt: number) => void
  onStop: () => void
}): React.JSX.Element {
  const padRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const held = useRef(false)
  const last = useRef({ pan: 0, tilt: 0 })
  const timer = useRef<number | null>(null)
  // Always call the latest callbacks (the speed setting can change while held).
  const onMoveRef = useRef(onMove)
  const onStopRef = useRef(onStop)
  onMoveRef.current = onMove
  onStopRef.current = onStop

  const release = (): void => {
    if (!held.current) return
    held.current = false
    watchGlobal(false)
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    last.current = { pan: 0, tilt: 0 }
    setKnob({ x: 0, y: 0 })
    onStopRef.current()
  }
  const watchGlobal = useReleaseEverywhere(held, release)

  // If the control becomes disabled (camera dropped) while held, stop.
  useEffect(() => {
    if (disabled) release()
  })
  useEffect(() => () => release(), [])

  const update = (e: React.PointerEvent): void => {
    const pad = padRef.current
    if (!pad) return
    const r = pad.getBoundingClientRect()
    const radius = r.width / 2
    let x = (e.clientX - (r.left + radius)) / radius
    let y = (e.clientY - (r.top + radius)) / radius
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    setKnob({ x, y })
    last.current = { pan: x, tilt: -y } // screen up = tilt up
    onMoveRef.current(x, -y)
  }

  return (
    <div
      ref={padRef}
      className={`joystick ${disabled ? 'disabled' : ''}`}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = true
        watchGlobal(true)
        update(e)
        timer.current = window.setInterval(() => onMoveRef.current(last.current.pan, last.current.tilt), KEEPALIVE_MS)
      }}
      onPointerMove={(e) => {
        if (!held.current) return
        if (e.buttons === 0) release() // button no longer down: treat as released
        else update(e)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      role="slider"
      aria-label="Pan and tilt joystick"
    >
      <div className="joystick-cross" />
      <span className="joy-label up">Up</span>
      <span className="joy-label down">Down</span>
      <span className="joy-label left">Left</span>
      <span className="joy-label right">Right</span>
      <div className="joystick-knob" style={{ transform: `translate(${knob.x * 70}%, ${knob.y * 70}%)` }} />
    </div>
  )
}

/** A button that acts only while it is held down (zoom, focus). Releasing it, or losing the pointer, stops. */
export function HoldButton({
  label,
  disabled,
  onStart,
  onStop,
  title
}: {
  label: string
  disabled: boolean
  onStart: () => void
  onStop: () => void
  title?: string
}): React.JSX.Element {
  const held = useRef(false)
  const timer = useRef<number | null>(null)
  const [active, setActive] = useState(false)
  const onStartRef = useRef(onStart)
  const onStopRef = useRef(onStop)
  onStartRef.current = onStart
  onStopRef.current = onStop

  const release = (): void => {
    if (!held.current) return
    held.current = false
    watchGlobal(false)
    setActive(false)
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    onStopRef.current()
  }
  const watchGlobal = useReleaseEverywhere(held, release)
  useEffect(() => {
    if (disabled) release()
  })
  useEffect(() => () => release(), [])

  return (
    <button
      className={`btn hold ${active ? 'active' : ''}`}
      disabled={disabled}
      title={title}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = true
        watchGlobal(true)
        setActive(true)
        onStartRef.current()
        timer.current = window.setInterval(() => onStartRef.current(), KEEPALIVE_MS) // re-confirm while held
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {label}
    </button>
  )
}

/** Two-way On/Off switch. */
export function Toggle({
  label,
  value,
  disabled,
  onChange
}: {
  label: string
  value: boolean | undefined
  disabled: boolean
  onChange: (on: boolean) => void
}): React.JSX.Element {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <div className="segmented">
        <button className={value === false ? 'on' : ''} disabled={disabled} onClick={() => onChange(false)}>
          Off
        </button>
        <button className={value === true ? 'on' : ''} disabled={disabled} onClick={() => onChange(true)}>
          On
        </button>
      </div>
    </div>
  )
}
