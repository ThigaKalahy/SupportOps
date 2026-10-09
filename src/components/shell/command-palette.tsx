"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  CalendarPlusIcon,
  ClipboardCheckIcon,
  CornerDownLeftIcon,
  FlameIcon,
  ListChecksIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import { loadRecentAgreements, searchPalette } from "@/actions/search"
import { FeedbackDialog } from "@/components/forms/feedback-dialog"
import { NoteDialog } from "@/components/forms/note-dialog"
import { OneOnOneDialog } from "@/components/forms/one-on-one-dialog"
import { useQuickAgreement } from "@/components/forms/quick-agreement"
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
import { DateStamp } from "@/components/ui/date-stamp"
import { HighlightedText } from "@/components/ui/highlighted-text"
import { fill, labels } from "@/lib/labels"
import { highlight, MIN_QUERY, normalize, SEARCH_PARAMS, searchTerms } from "@/lib/search"
import type { RecentAgreement, SearchResults } from "@/server/queries/search"

import { footerNav, mainNav } from "./nav-config"

const C = labels.command
const K = labels.search.kinds

type Person = { id: string; preferredName: string }
type Form = "oneOnOne" | "feedback" | "note"
type Mode = { kind: "root" } | { kind: "pick"; action: Form | "agreement" }

const PALETTE_EVENT = "prontuario:open-palette"

/** Abre a paleta de qualquer lugar (ex.: o campo de busca da barra de contexto). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT))
}

/** "/team/<id>" ou "/team/<id>/..." → id da pessoa no contexto. */
function personInPath(pathname: string): string | null {
  const match = /^\/team\/([^/]+)/.exec(pathname)
  return match?.[1] ?? null
}

function matchesQuery(text: string, query: string): boolean {
  const terms = searchTerms(query)
  const target = normalize(text)
  return terms.length > 0 && terms.every((t) => target.includes(t))
}

/**
 * Paleta de comandos (⌘K / Ctrl+K): navegar e registrar num só lugar.
 *
 * - Vazia: com uma pessoa no contexto (perfil aberto), registrar para ela;
 *   registrar (daily, combinado, validação, 1:1, feedback, anotação); ir para
 *   as páginas; combinados recentes.
 * - Digitando: pessoas (abrir perfil e, para quem escreve, registrar para a
 *   primeira delas), ações e páginas que casam, e a busca no servidor
 *   (full-text em português, agrupada por tipo, trecho com o termo
 *   destacado), mais "ver todos" em /search.
 *
 * 1:1, feedback, anotação e combinado sem pessoa definida pedem "com quem?"
 * dentro da própria paleta. O VIEWER só navega e busca.
 */
export function CommandPalette({ people, canWrite }: { people: Person[]; canWrite: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const quick = useQuickAgreement()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [mode, setMode] = React.useState<Mode>({ kind: "root" })
  const [results, setResults] = React.useState<SearchResults | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [recent, setRecent] = React.useState<RecentAgreement[] | null>(null)
  const [dialog, setDialog] = React.useState<{ form: Form; member: Person } | null>(null)
  const request = React.useRef(0)

  const contextPerson = React.useMemo(() => {
    const id = personInPath(pathname)
    return id ? (people.find((p) => p.id === id) ?? null) : null
  }, [pathname, people])

  // ⌘K / Ctrl+K em qualquer lugar (inclusive com o foco num campo), e o evento do campo de busca.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(PALETTE_EVENT, onOpen)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    setQuery("")
    setMode({ kind: "root" })
    setResults(null)
    loadRecentAgreements().then(setRecent, () => setRecent([]))
  }, [open])

  // Busca no servidor enquanto digita (espera 200 ms; resposta antiga é descartada).
  React.useEffect(() => {
    if (mode.kind !== "root" || searchTerms(query).join("").length < MIN_QUERY) {
      setResults(null)
      setSearching(false)
      return
    }
    const id = ++request.current
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchPalette(query).then(
        (r) => {
          if (id !== request.current) return
          setResults(r)
          setSearching(false)
        },
        () => id === request.current && setSearching(false),
      )
    }, 200)
    return () => window.clearTimeout(timer)
  }, [query, mode.kind])

  function close() {
    setOpen(false)
  }

  function go(href: string) {
    close()
    router.push(href)
  }

  function register(action: Form | "agreement", member: Person) {
    close()
    if (action === "agreement") quick?.open({ member })
    else setDialog({ form: action, member })
  }

  function startPick(action: Form | "agreement") {
    setMode({ kind: "pick", action })
    setQuery("")
  }

  const typed = query.trim().length > 0
  const matchedPeople = typed ? people.filter((p) => matchesQuery(p.preferredName, query)).slice(0, 5) : []
  const firstPerson = matchedPeople[0] ?? null

  const registerActions: { id: string; label: string; icon: React.ReactNode; run: () => void; shortcut?: string }[] = canWrite
    ? [
        { id: "daily", label: C.actions.daily, icon: <CalendarPlusIcon />, run: () => go("/dailies/new") },
        {
          id: "agreement",
          label: C.actions.agreement,
          icon: <ListChecksIcon />,
          shortcut: "C",
          run: () => {
            close()
            quick?.open(contextPerson ? { member: contextPerson } : {})
          },
        },
        { id: "validation", label: C.actions.validation, icon: <ClipboardCheckIcon />, run: () => go("/priority-validations") },
        { id: "oneOnOne", label: C.actions.oneOnOne, icon: <UsersIcon />, run: () => startPick("oneOnOne") },
        { id: "feedback", label: C.actions.feedback, icon: <MessageSquareIcon />, run: () => startPick("feedback") },
        { id: "note", label: C.actions.note, icon: <NotebookPenIcon />, run: () => startPick("note") },
        // P21: manual, sem vínculo obrigatório; com uma pessoa no contexto, ela já vem filtrada.
        {
          id: "watch",
          label: C.actions.watch,
          icon: <FlameIcon />,
          run: () => go(contextPerson ? `/watch?new=1&member=${contextPerson.id}` : "/watch?new=1"),
        },
      ]
    : []
  const pages = [...mainNav, ...footerNav]
  const shownActions = typed ? registerActions.filter((a) => matchesQuery(a.label, query)) : registerActions
  const shownPages = typed ? pages.filter((p) => matchesQuery(p.label, query)) : pages

  // As mesmas quatro ações para qualquer pessoa; o nome entra no rótulo.
  const personActions = () =>
    canWrite
      ? ([
          ["oneOnOne", C.forPerson.oneOnOne, <UsersIcon key="i" />],
          ["feedback", C.forPerson.feedback, <MessageSquareIcon key="i" />],
          ["agreement", C.forPerson.agreement, <ListChecksIcon key="i" />],
          ["note", C.forPerson.note, <NotebookPenIcon key="i" />],
        ] as const)
      : []

  const pickLabel = mode.kind === "pick" ? (mode.action === "agreement" ? C.actions.agreement : C.actions[mode.action]) : ""
  const pickPeople = mode.kind === "pick" ? (typed ? people.filter((p) => matchesQuery(p.preferredName, query)) : people) : []

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} className="max-w-dialog-wide">
        {/* Filtro próprio (sem acento, por palavra) e ordem da renderização: o cmdk não reordena. */}
        <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={mode.kind === "pick" ? C.pickPlaceholder : C.placeholder}
          onKeyDown={(e) => {
            if (mode.kind === "pick" && e.key === "Backspace" && query === "") {
              e.preventDefault()
              setMode({ kind: "root" })
            }
          }}
        />
        <CommandList className="max-h-[min(60svh,520px)]">
          {mode.kind === "pick" ? (
            <>
              <CommandEmpty>{labels.common.noResults}</CommandEmpty>
              <CommandGroup heading={fill(C.groups.pick, { action: pickLabel })}>
                {pickPeople.map((p) => (
                  <CommandItem key={p.id} value={`pick-${p.id}`} onSelect={() => register(mode.action, p)}>
                    <UserIcon />
                    {p.preferredName}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : (
            <>
              {!typed && contextPerson && canWrite ? (
                <CommandGroup heading={fill(C.groups.context, { name: contextPerson.preferredName })}>
                  {personActions().map(([action, label, icon]) => (
                    <CommandItem key={action} value={`ctx-${action}`} onSelect={() => register(action, contextPerson)}>
                      {icon}
                      {fill(label, { name: contextPerson.preferredName })}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {matchedPeople.length > 0 ? (
                <CommandGroup heading={C.groups.people}>
                  {matchedPeople.map((p) => (
                    <CommandItem key={p.id} value={`person-${p.id}`} onSelect={() => go(`/team/${p.id}`)}>
                      <UserIcon />
                      <span className="flex-1 truncate">{p.preferredName}</span>
                      <span className="text-xs text-ink-secondary">{C.actions.openProfile}</span>
                    </CommandItem>
                  ))}
                  {firstPerson
                    ? personActions().map(([action, label, icon]) => (
                        <CommandItem key={action} value={`for-${firstPerson.id}-${action}`} onSelect={() => register(action, firstPerson)}>
                          {icon}
                          {fill(label, { name: firstPerson.preferredName })}
                        </CommandItem>
                      ))
                    : null}
                </CommandGroup>
              ) : null}

              {shownActions.length > 0 ? (
                <CommandGroup heading={C.groups.register}>
                  {shownActions.map((a) => (
                    <CommandItem key={a.id} value={`action-${a.id}`} onSelect={a.run}>
                      {a.icon}
                      <span className="flex-1">{a.label}</span>
                      {["oneOnOne", "feedback", "note"].includes(a.id) ? (
                        <span className="text-xs text-ink-secondary">{C.choosePerson}</span>
                      ) : a.shortcut ? (
                        <CommandShortcut>{a.shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {shownPages.length > 0 ? (
                <CommandGroup heading={C.groups.navigate}>
                  {shownPages.map((p) => {
                    const Icon = p.icon
                    return (
                      <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                        <Icon />
                        {p.label}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ) : null}

              {!typed && recent && recent.length > 0 ? (
                <CommandGroup heading={C.groups.recent}>
                  {recent.map((a) => (
                    <CommandItem key={a.id} value={`recent-${a.id}`} onSelect={() => go(`/agreements/${a.id}`)}>
                      <ListChecksIcon />
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      <span className="shrink-0 text-xs text-ink-secondary">{a.member.preferredName}</span>
                      <DateStamp date={a.dueDate} kind="business" display="short" className="shrink-0 text-ink-secondary" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {typed ? (
                <>
                  <CommandSeparator />
                  {results
                    ? results.groups
                        .filter((g) => g.kind !== "person")
                        .map((g) => (
                          <CommandGroup key={g.kind} heading={`${K[g.kind]} · ${g.total}`}>
                            {g.hits.map((h) => (
                              <CommandItem key={h.id} value={`hit-${g.kind}-${h.id}`} onSelect={() => go(h.href)} className="h-auto items-start py-1.5">
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <span className="flex items-center gap-2 text-xs text-ink-secondary">
                                    <span className="font-medium text-ink">{h.member.preferredName}</span>
                                    <DateStamp date={h.date} kind={h.businessDate ? "business" : "timestamp"} />
                                  </span>
                                  <HighlightedText parts={highlight(h.body || h.title, query, 120)} className="line-clamp-2 text-sm" />
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))
                    : null}
                  <CommandGroup>
                    {searching ? (
                      <p role="status" className="px-2 py-1.5 text-xs text-ink-secondary">
                        {C.searching}
                      </p>
                    ) : searchTerms(query).join("").length < MIN_QUERY ? (
                      <p className="px-2 py-1.5 text-xs text-ink-secondary">{C.tooShort}</p>
                    ) : results && results.groups.length === 0 && matchedPeople.length === 0 ? (
                      <p role="status" className="px-2 py-1.5 text-xs text-ink-secondary">
                        {fill(C.noResults, { query: query.trim() })}
                      </p>
                    ) : null}
                    {searchTerms(query).join("").length >= MIN_QUERY ? (
                      <CommandItem
                        value="see-all"
                        onSelect={() => go(`/search?${new URLSearchParams({ [SEARCH_PARAMS.q]: query.trim() })}`)}
                      >
                        <SearchIcon />
                        <span className="flex-1">{fill(C.seeAll, { query: query.trim() })}</span>
                        <CornerDownLeftIcon className="text-ink-tertiary" />
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                </>
              ) : null}
            </>
          )}
        </CommandList>
        <p className="border-t border-line px-3 py-1.5 text-2xs text-ink-secondary">{C.hint}</p>
        </Command>
      </CommandDialog>

      {dialog?.form === "oneOnOne" ? (
        <OneOnOneDialog open onOpenChange={(next) => !next && setDialog(null)} member={dialog.member} />
      ) : null}
      {dialog?.form === "feedback" ? (
        <FeedbackDialog open onOpenChange={(next) => !next && setDialog(null)} member={dialog.member} />
      ) : null}
      {dialog?.form === "note" ? <NoteDialog open onOpenChange={(next) => !next && setDialog(null)} member={dialog.member} /> : null}
    </>
  )
}
