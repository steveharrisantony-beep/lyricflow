import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link2, Layers, Type, Gauge, Settings2, X } from "lucide-react";

export type SettingsPage =
  | "mapping"
  | "background"
  | "lyrics"
  | "engine"
  | "others";
const pages = [
  { id: "mapping", label: "Song Mapping", icon: Link2 },
  { id: "background", label: "Background", icon: Layers },
  { id: "lyrics", label: "Lyrics", icon: Type },
  { id: "engine", label: "Render Engine", icon: Gauge },
  { id: "others", label: "Others", icon: Settings2 },
] as const;

export function SettingGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="setting-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function RangeSetting({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = "%",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-setting">
      <span>
        {label}
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SwitchSetting({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-setting">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function SettingsPanel({
  page,
  onPageChange,
  open,
  fullscreen,
  onClose,
  children,
}: {
  page: SettingsPage;
  onPageChange: (page: SettingsPage) => void;
  open: boolean;
  fullscreen: boolean;
  onClose: () => void;
  children: Record<SettingsPage, ReactNode>;
}) {
  const panel = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [compact, setCompact] = useState(
    () => window.matchMedia?.("(max-width: 1100px)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 1100px)");
    if (!query) return;
    const update = () => setCompact(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  const modal = open && (compact || fullscreen);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>(".settings-close")?.focus();
    const handleKey = (e: KeyboardEvent) => {
      // A source dialog may be above this sheet. Let its own focus handling win.
      if (document.querySelector(".source-modal")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key !== "Tab") return;
      const focusable = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
        ) || []),
      ].filter(
        (el) => el.getClientRects().length > 0 && !el.closest("[hidden]"),
      );
      const first = focusable[0],
        last = focusable.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !panel.current?.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handleKey);
      previous?.focus({ preventScroll: true });
    };
  }, [modal, onClose]);

  return (
    <>
      {modal && (
        <button
          className="settings-scrim"
          aria-label="Close settings"
          onClick={onClose}
          tabIndex={-1}
        />
      )}
      <aside
        id="app-settings"
        ref={panel}
        className={"settings-panel glass " + (open ? "settings-open" : "")}
        role={modal ? "dialog" : undefined}
        aria-modal={modal || undefined}
        aria-label="Settings"
      >
        <div className="settings-heading">
          <h2>Settings</h2>
          <button
            type="button"
            className="icon-button settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <div
          className="settings-nav"
          role="tablist"
          aria-label="Settings sections"
        >
          {pages.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              type="button"
              ref={(el) => {
                tabs.current[index] = el;
              }}
              id={"settings-tab-" + id}
              role="tab"
              aria-selected={page === id}
              aria-controls={"settings-page-" + id}
              tabIndex={page === id ? 0 : -1}
              onClick={() => onPageChange(id)}
              onKeyDown={(e) => {
                let next = index;
                if (e.key === "ArrowRight" || e.key === "ArrowDown")
                  next = (index + 1) % pages.length;
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                  next = (index - 1 + pages.length) % pages.length;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = pages.length - 1;
                else return;
                e.preventDefault();
                onPageChange(pages[next].id);
                tabs.current[next]?.focus();
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="settings-pages">
          {pages.map(({ id, label }) => (
            <div
              key={id}
              id={"settings-page-" + id}
              role="tabpanel"
              aria-labelledby={"settings-tab-" + id}
              hidden={page !== id}
              tabIndex={0}
              className="settings-page"
            >
              <h2 className="settings-page-title">{label}</h2>
              {children[id]}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
