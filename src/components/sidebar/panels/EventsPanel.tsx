import { useTheme } from "../../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../../styles/tokens";
import { Section } from "../../../ui";
import { themeVars } from "../../../ui/vars";
import { eventDate, eventEndDate, eventTotal, type EventPreset } from "../../../map/events";

const BAR_W = 38;
const BAR_H = 30;

/** 「月/日」短標（YYYY-MM-DD → M/D） */
function shortDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/**
 * 事件面板：精選事件卡（場景列樣式：左 2px 線 + 名稱 + 副標）。點卡片套用事件；
 * 長文連結是卡片內的獨立 <a>（不包在按鈕裡）。compact = 手機抽屜用，省略引述。
 */
export function EventsPanel({
  events,
  activeId,
  onApply,
  title = "CURATED · 精選",
  compact = false,
}: {
  events: EventPreset[];
  activeId: string | null;
  onApply: (ev: EventPreset) => void;
  title?: string;
  compact?: boolean;
}) {
  const { tokens, isDark } = useTheme();

  return (
    <Section
      title={title}
      right={<span style={{ fontFamily: FONT.data, fontSize: SIZE.minor, letterSpacing: 0 }}>{events.length}</span>}
    >
      {events.map((ev) => {
        const active = ev.id === activeId;
        const max = Math.max(...ev.daily);
        return (
          <div
            key={ev.id}
            style={{
              background: active ? tokens.accentSoft : "transparent",
              border: `1px solid ${active ? tokens.border : "transparent"}`,
              borderRadius: RADIUS.base,
            }}
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onApply(ev)}
              className="fa-focus fa-hover"
              style={{
                ...themeVars(tokens),
                display: "flex",
                alignItems: "stretch",
                gap: SPACE.s8,
                width: "100%",
                padding: `${SPACE.s8}px ${SPACE.s8}px ${ev.noteHref ? 0 : SPACE.s8}px`,
                background: "transparent",
                border: "none",
                borderRadius: RADIUS.base,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: FONT.ui,
                color: tokens.fg1,
              }}
            >
              <span style={{ width: 2, background: active ? tokens.accent : tokens.border, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: SIZE.body, color: tokens.fg1, fontWeight: 600, lineHeight: 1.3 }}>{ev.name}</div>
                <div style={{ fontSize: SIZE.minor, color: tokens.fg3, fontFamily: FONT.data, lineHeight: 1.45 }}>
                  {ev.start} – {eventEndDate(ev).slice(5)}
                </div>
                <div style={{ fontSize: SIZE.minor, color: tokens.fg3, lineHeight: 1.45 }}>
                  {ev.scopeLabel} · <span style={{ fontFamily: FONT.data }}>{ev.days}</span> 天
                </div>
                {!compact && (
                  <div style={{ fontSize: SIZE.minor, color: tokens.fg2, lineHeight: 1.45, margin: `${SPACE.s4}px 0 ${SPACE.s6}px` }}>
                    「{ev.quote}」
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: SPACE.s8, marginTop: compact ? SPACE.s6 : 0 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: SPACE.s2, height: BAR_H }}>
                      {ev.daily.map((v, i) => (
                        <div
                          key={i}
                          title={`${shortDay(eventDate(ev, i))}：${v.toLocaleString()} 筆`}
                          style={{ width: BAR_W, height: `${Math.max(6, (v / max) * 100)}%`, background: tokens.fg2 }}
                        />
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: SPACE.s2, fontFamily: FONT.data, fontSize: SIZE.eyebrow, color: tokens.fg3 }}>
                      {ev.daily.map((_, i) => (
                        <span key={i} style={{ width: BAR_W, textAlign: "center", whiteSpace: "nowrap" }}>{shortDay(eventDate(ev, i))}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: SIZE.eyebrow, color: tokens.fg3 }}>每日軌跡 · 台北日期</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: FONT.data, fontVariantNumeric: "tabular-nums", fontSize: SIZE.sub, color: tokens.fg1 }}>
                      {eventTotal(ev).toLocaleString()}
                    </div>
                    <div style={{ fontSize: SIZE.minor, color: tokens.fg3 }}>筆軌跡</div>
                  </div>
                </div>
              </div>
            </button>
            {ev.noteHref && (
              <div style={{ display: "flex", justifyContent: "flex-end", padding: `${SPACE.s4}px ${SPACE.s8}px ${SPACE.s8}px` }}>
                <a
                  href={`${ev.noteHref}?theme=${isDark ? "dark" : "light"}`}
                  className="fa-focus"
                  style={{ fontSize: SIZE.minor, color: tokens.fg2, textDecoration: "none", borderBottom: `1px solid ${tokens.border}` }}
                >
                  長文 →
                </a>
              </div>
            )}
          </div>
        );
      })}
      {!compact && (
        <div style={{ fontSize: SIZE.minor, color: tokens.fg3, lineHeight: 1.45, padding: `${SPACE.s2}px ${SPACE.s8}px` }}>
          點卡片：切到事件範圍、跳到首日，天數＝事件長度
        </div>
      )}
    </Section>
  );
}
