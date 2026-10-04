"use client"

import * as React from "react"
import { CalendarPlusIcon, ClipboardListIcon, EllipsisIcon, ListChecksIcon, UserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DesktopHint } from "@/components/ui/desktop-hint"
import { HighlightedText } from "@/components/ui/highlighted-text"
import { Label } from "@/components/ui/label"
import { Toast, ToastProvider, useToast } from "@/components/ui/toast"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { labels } from "@/lib/labels"
import { highlight } from "@/lib/search"

import { demo, eventTypes, people } from "../_fixtures"
import { Specimen } from "./specimen"

function PaletteContent() {
  return (
    <>
      <CommandInput placeholder={labels.command.placeholder} />
      <CommandList>
        <CommandEmpty>{labels.common.noResults}</CommandEmpty>
        <CommandGroup heading={demo.commandGroupActions}>
          <CommandItem>
            <ListChecksIcon />
            {demo.commandNewAgreement}
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <CalendarPlusIcon />
            {demo.commandNewDaily}
            <CommandShortcut>D</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={demo.commandGroupPeople}>
          {people.slice(0, 4).map((name) => (
            <CommandItem key={name}>
              <UserIcon />
              {name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  )
}

export function LabOverlays() {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [shared, setShared] = React.useState(true)
  const [types, setTypes] = React.useState<string[]>(["Feedback", "1:1"])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-8">
        <Specimen state="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{demo.dialogTrigger}</Button>
            </DialogTrigger>
            {/* Ação destrutiva nunca é o botão padrão: o foco inicial vai para Cancelar. */}
            <DialogContent
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                cancelRef.current?.focus()
              }}
            >
              <DialogHeader>
                <DialogTitle>{demo.dialogTitle}</DialogTitle>
                <DialogDescription>{demo.dialogDescription}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button ref={cancelRef} variant="secondary">
                    {labels.common.cancel}
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive">{demo.dialogConfirm}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Specimen>

        <Specimen state="Sheet">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">{demo.sheetTrigger}</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{demo.sheetTitle}</SheetTitle>
                <SheetDescription>{demo.sheetDescription}</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </Specimen>

        <Specimen state="DropdownMenu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                {demo.dropdownTrigger}
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{demo.dropdownLabel}</DropdownMenuLabel>
              <DropdownMenuItem>
                <ClipboardListIcon />
                {demo.dropdownEdit}
                <DropdownMenuShortcut>E</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>{demo.dropdownReschedule}</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={shared} onCheckedChange={(v) => setShared(v === true)}>
                {demo.dropdownShare}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">{demo.dropdownCancel}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Specimen>

        <Specimen state="Popover">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">{demo.popoverTrigger}</Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>{demo.popoverTitle}</PopoverTitle>
                <PopoverDescription>{demo.popoverDescription}</PopoverDescription>
              </PopoverHeader>
              <div className="flex flex-col gap-2">
                {eventTypes.map((type) => {
                  const id = `lab-type-${type}`
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={types.includes(type)}
                        onCheckedChange={(v) =>
                          setTypes((current) => (v === true ? [...current, type] : current.filter((t) => t !== type)))
                        }
                      />
                      <Label htmlFor={id} className="font-normal">
                        {type}
                      </Label>
                    </div>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        </Specimen>

        <Specimen state="Tooltip">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">{demo.tooltipTrigger}</Button>
            </TooltipTrigger>
            <TooltipContent>{demo.tooltipText}</TooltipContent>
          </Tooltip>
        </Specimen>

        <Specimen state="CommandDialog">
          <Button variant="secondary" onClick={() => setPaletteOpen(true)}>
            {demo.commandTrigger}
            <kbd className="rounded-xs border border-line px-1 font-mono text-2xs text-ink-secondary">⌘K</kbd>
          </Button>
          <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
            <Command>
              <PaletteContent />
            </Command>
          </CommandDialog>
        </Specimen>
      </div>

      <Specimen state="Command (inline)">
        <Command className="max-w-dialog rounded-lg border border-line">
          <PaletteContent />
        </Command>
      </Specimen>

      <Specimen state="DesktopHint · aviso de formulário longo (no app só aparece abaixo de 768px; aqui forçado)" className="w-full">
        <div className="w-full max-w-[360px]">
          <DesktopHint className="md:flex" />
        </div>
      </Specimen>

      <Specimen state="HighlightedText · trecho da busca, termo sem acento casando com acentuado, com corte" className="w-full">
        <p className="max-w-2xl text-sm">
          <HighlightedText
            parts={highlight(
              "Na semana passada mandou o relatório de julho ao cliente Atlas com dados errados de agosto; os relatórios seguintes saíram certos depois da revisão em par.",
              "relatorio atlas",
              120,
            )}
          />
        </p>
      </Specimen>

      <Specimen state="Toast · confirmação (calm) · neutro · disparo real (some em 4 s, pausa com o ponteiro)" className="w-full">
        <div className="flex w-full max-w-[360px] flex-col gap-2">
          <Toast static item={{ message: labels.toast.feedbackCreated, tone: "calm" }} onDismiss={() => {}} />
          <Toast static item={{ message: labels.toast.recordUpdated, tone: "neutral" }} onDismiss={() => {}} />
          <ToastProvider>
            <ToastTrigger />
          </ToastProvider>
        </div>
      </Specimen>
    </div>
  )
}

function ToastTrigger() {
  const toast = useToast()
  return (
    <Button variant="secondary" className="self-start" onClick={() => toast.show(labels.toast.oneOnOneCreated)}>
      {labels.uiLab.showToast}
    </Button>
  )
}

export function LabCalendar({ today }: { today: Date }) {
  // Data de negócio (meia-noite UTC) → Date local do mesmo dia, como o DayPicker espera.
  const localToday = new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const [selected, setSelected] = React.useState<Date | undefined>(
    new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + 3)
  )

  return (
    <Specimen state={`${labels.uiLab.states.default} + ${labels.uiLab.states.selected}`}>
      <div className="rounded-lg border border-line bg-surface">
        <Calendar mode="single" selected={selected} onSelect={setSelected} defaultMonth={localToday} today={localToday} />
      </div>
    </Specimen>
  )
}
