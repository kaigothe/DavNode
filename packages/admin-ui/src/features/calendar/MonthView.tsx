import { Flex, theme } from 'antd';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  layoutBars,
  singleDayEvents,
  type ViewEvent,
} from '../../lib/calendarLayout';
import { formatTimeRange, dayKey } from '../../lib/events';
import { eventLabel } from './eventLabel';
import { useEventColors, useTodayColors } from './useEventColors';

/** How many single-day events a month cell lists before it says "+n more". */
const MAX_LINES = 4;
const BAR_HEIGHT = 22;

const reset = {
  border: 0,
  cursor: 'pointer',
  font: 'inherit',
} as const;

/**
 * The month as a grid of weeks. Events that span days (all-day ones and
 * those over midnight) are bars across the days; the others are listed in
 * their day with a coloured dot and their time. A date opens that day.
 */
export function MonthView({
  days,
  month,
  today,
  events,
  onOpenEvent,
  onOpenDay,
}: {
  days: readonly Dayjs[];
  /** The month being looked at; days of the neighbouring months are dimmed. */
  month: Dayjs;
  today: Dayjs;
  events: readonly ViewEvent[];
  onOpenEvent: (event: ViewEvent) => void;
  onOpenDay: (day: Dayjs) => void;
}) {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const colors = useEventColors();
  const todayColors = useTodayColors();
  const locale = i18n.language;
  const weeks = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  const line = `1px solid ${token.colorBorderSecondary}`;
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  return (
    <section
      aria-label={t('calendar.views.month')}
      style={{
        overflowX: 'auto',
        border: line,
        borderRadius: 8,
        background: token.colorBgContainer,
      }}
    >
      <div style={{ minWidth: 640 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          }}
        >
          {days.slice(0, 7).map((day) => (
            <div
              key={day.day()}
              style={{
                padding: '6px 8px',
                textAlign: 'end',
                fontSize: 12,
                color: token.colorTextSecondary,
                borderBottom: line,
              }}
            >
              {weekdayFormat.format(day.toDate())}
            </div>
          ))}
        </div>
        {weeks.map((week) => {
          const { bars, lanes } = layoutBars(events, week, true);
          const perDay = singleDayEvents(events, week);
          const listRow = lanes + 2;
          return (
            <div
              key={week[0]?.valueOf()}
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gridTemplateRows: `auto${lanes > 0 ? ` repeat(${lanes}, ${BAR_HEIGHT + 2}px)` : ''} 1fr`,
                minHeight: 120,
              }}
            >
              {week.map((day, column) => (
                <div
                  key={`bg${day.valueOf()}`}
                  aria-hidden
                  style={{
                    gridColumn: column + 1,
                    gridRow: '1 / -1',
                    borderTop: line,
                    borderInlineStart: column === 0 ? 0 : line,
                    background: day.isSame(month, 'month')
                      ? 'transparent'
                      : token.colorFillQuaternary,
                  }}
                />
              ))}
              {week.map((day, column) => {
                const isToday = day.isSame(today, 'day');
                const first = day.date() === 1;
                return (
                  <div
                    key={`n${day.valueOf()}`}
                    style={{
                      gridColumn: column + 1,
                      gridRow: 1,
                      position: 'relative',
                      textAlign: 'end',
                      padding: '4px 6px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      // The first of a month shows "1 Oct": the name has to contain that.
                      aria-label={`${
                        first
                          ? `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(day.toDate())}, `
                          : ''
                      }${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(day.toDate())}`}
                      aria-current={isToday ? 'date' : undefined}
                      style={{
                        ...reset,
                        minWidth: 26,
                        height: 26,
                        padding: '0 6px',
                        borderRadius: 13,
                        fontSize: 13,
                        fontWeight: isToday || first ? 700 : 400,
                        background: isToday ? todayColors.fill : 'transparent',
                        color: isToday
                          ? '#fff'
                          : day.isSame(month, 'month')
                            ? token.colorText
                            : token.colorTextSecondary,
                      }}
                    >
                      {first
                        ? new Intl.DateTimeFormat(locale, {
                            day: 'numeric',
                            month: 'short',
                          }).format(day.toDate())
                        : day.date()}
                    </button>
                  </div>
                );
              })}
              {bars.map((bar) => {
                const palette = colors.solid(bar.event.color);
                return (
                  <button
                    key={`b${bar.event.key}-${bar.startColumn}`}
                    type="button"
                    onClick={() => onOpenEvent(bar.event)}
                    aria-label={eventLabel(
                      bar.event,
                      week[bar.startColumn],
                      locale,
                      t,
                    )}
                    style={{
                      ...reset,
                      gridColumn: `${bar.startColumn + 1} / ${bar.endColumn + 2}`,
                      gridRow: bar.lane + 2,
                      height: BAR_HEIGHT,
                      margin: '1px 4px',
                      marginInlineStart: bar.before ? 0 : 4,
                      marginInlineEnd: bar.after ? 0 : 4,
                      padding: '0 6px',
                      borderRadius: `${bar.before ? 0 : 6}px ${bar.after ? 0 : 6}px ${bar.after ? 0 : 6}px ${bar.before ? 0 : 6}px`,
                      background: palette.background,
                      color: palette.text,
                      fontSize: 12,
                      textAlign: 'start',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      zIndex: 1,
                    }}
                  >
                    {bar.event.summary ?? t('content.untitled')}
                  </button>
                );
              })}
              {week.map((day, column) => {
                const list = perDay[column] ?? [];
                return (
                  <Flex
                    key={`l${day.valueOf()}`}
                    data-day={dayKey(day)}
                    vertical
                    gap={1}
                    style={{
                      gridColumn: column + 1,
                      gridRow: listRow,
                      padding: '0 4px 4px',
                      zIndex: 1,
                      minWidth: 0,
                    }}
                  >
                    {list.slice(0, MAX_LINES).map((event) => (
                      <button
                        key={event.key}
                        type="button"
                        onClick={() => onOpenEvent(event)}
                        aria-label={eventLabel(event, day, locale, t, {
                          timeFirst: true,
                        })}
                        style={{
                          ...reset,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          width: '100%',
                          padding: '1px 4px',
                          borderRadius: 4,
                          background: 'transparent',
                          color: token.colorText,
                          fontSize: 12,
                          textAlign: 'start',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            flex: 'none',
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: event.color,
                          }}
                        />
                        <span
                          style={{
                            flex: 'none',
                            color: token.colorTextSecondary,
                          }}
                        >
                          {
                            formatTimeRange(event, locale, dayKey(day)).split(
                              ' – ',
                            )[0]
                          }
                        </span>{' '}
                        <span
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {event.summary ?? t('content.untitled')}
                        </span>
                      </button>
                    ))}
                    {list.length > MAX_LINES && (
                      <button
                        type="button"
                        onClick={() => onOpenDay(day)}
                        style={{
                          ...reset,
                          background: 'transparent',
                          color: token.colorLink,
                          fontSize: 12,
                          textAlign: 'start',
                          padding: '1px 4px',
                        }}
                      >
                        {t('content.more', { count: list.length - MAX_LINES })}
                      </button>
                    )}
                  </Flex>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
