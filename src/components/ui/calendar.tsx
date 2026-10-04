"use client"

import * as React from "react"
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker"
import { ptBR } from "react-day-picker/locale"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Calendário em pt-BR. Datas de negócio: o dia selecionado é um Date local
 * (meia-noite do navegador); a conversão para `@db.Date` acontece no formulário
 * com `parseBusinessDate` de src/lib/dates.ts.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  locale = ptBR,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      locale={locale}
      className={cn("p-2 [--cell-size:--spacing(8)]", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", defaults.months),
        month: cn("flex w-full flex-col gap-2", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between", defaults.nav),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-(--cell-size) aria-disabled:opacity-50",
          defaults.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-(--cell-size) aria-disabled:opacity-50",
          defaults.button_next
        ),
        month_caption: cn("flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)", defaults.month_caption),
        dropdowns: cn("flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium", defaults.dropdowns),
        dropdown_root: cn("relative rounded-sm border border-line", defaults.dropdown_root),
        dropdown: cn("absolute inset-0 bg-surface opacity-0", defaults.dropdown),
        caption_label: cn(
          "text-sm font-medium text-ink select-none first-letter:uppercase",
          captionLayout !== "label" && "flex h-7 items-center gap-1 pr-1 pl-2 [&>svg]:size-3.5 [&>svg]:text-ink-secondary",
          defaults.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "w-(--cell-size) font-mono text-2xs font-medium tracking-label text-ink-secondary uppercase select-none",
          defaults.weekday
        ),
        week: cn("mt-1 flex w-full", defaults.week),
        week_number_header: cn("w-(--cell-size) select-none", defaults.week_number_header),
        week_number: cn("font-mono text-2xs text-ink-secondary select-none", defaults.week_number),
        day: cn("relative size-(--cell-size) p-0 text-center select-none", defaults.day),
        range_start: cn("rounded-l-sm bg-accent-wash", defaults.range_start),
        range_middle: cn("rounded-none bg-accent-wash", defaults.range_middle),
        range_end: cn("rounded-r-sm bg-accent-wash", defaults.range_end),
        today: cn("font-semibold text-accent", defaults.today),
        outside: cn("text-ink-secondary", defaults.outside),
        disabled: cn("text-ink-secondary opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...rootProps }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...rootProps} />
        ),
        Chevron: ({ className, orientation, ...chevronProps }) => {
          const Icon =
            orientation === "left" ? ChevronLeftIcon : orientation === "right" ? ChevronRightIcon : ChevronDownIcon
          return <Icon className={cn("size-4", className)} {...chevronProps} />
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const defaults = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const selectedSingle =
    modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.isoDate}
      data-selected-single={selectedSingle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex size-(--cell-size) items-center justify-center rounded-sm font-mono text-xs text-inherit transition-colors hover:bg-surface-sunken disabled:pointer-events-none",
        "data-[selected-single=true]:bg-accent data-[selected-single=true]:text-surface",
        "data-[range-start=true]:bg-accent data-[range-start=true]:text-surface data-[range-end=true]:bg-accent data-[range-end=true]:text-surface",
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-transparent",
        defaults.day_button,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
