"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { ensureCentral } from "@/actions/centrals"
import type { EnsureCentralResult } from "@/server/centrals"
import { Command, CommandItem, CommandList } from "@/components/ui/command"
import { controlClasses } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { centralSlug, cleanCentralName, matchesCentral } from "@/lib/centrals"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

const C = labels.centrals
const CREATE = "__create__"

export interface CentralOption {
  id: string
  name: string
}

type Notice = { tone: "info" | "error"; text: string } | null

/**
 * Campo de central de atendimento (P19, D20). Parece texto livre, grava a
 * referência normalizada: digitar filtra as centrais ativas (sem acento e sem
 * caso); sem correspondência, a última opção é "Criar central: <texto>", que
 * cria e seleciona na mesma ação, sem dialog. O servidor confere o slug antes
 * de criar: grafia diferente de uma central existente seleciona a existente e
 * avisa numa linha discreta. Opcional: vazio é válido, e pular com Tab também —
 * o campo não acrescenta parada (o botão de limpar fica fora do Tab).
 *
 * Teclado: setas movem na lista, Enter escolhe (só com a lista aberta; fechada,
 * o Enter segue para o formulário), Esc fecha a lista sem fechar o dialog.
 */
export function CentralCombobox({
  value,
  onValueChange,
  options,
  canCreate = true,
  onCreate,
  createCentral = ensureCentral,
  className,
  inputClassName,
  placeholder = C.placeholder,
  ...inputProps
}: {
  value: string | null
  onValueChange: (id: string | null) => void
  /** Centrais ativas. A criada aqui entra na lista local até a próxima leitura. */
  options: CentralOption[]
  /** Falso para quem só lê (sem "Criar central"). */
  canCreate?: boolean
  /** Avisa quem guarda a lista (ex.: a daily, para as outras linhas verem a central nova). */
  onCreate?: (option: CentralOption) => void
  /** Quem cria no servidor; o /ui-lab passa uma versão simulada. */
  createCentral?: (input: { name: string }) => Promise<EnsureCentralResult>
  className?: string
  /** Classes do campo (ex.: altura 32px na linha da daily). */
  inputClassName?: string
  placeholder?: string
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue" | "type">) {
  const [created, setCreated] = React.useState<CentralOption[]>([])
  const all = React.useMemo(() => {
    const ids = new Set(options.map((o) => o.id))
    return [...options, ...created.filter((c) => !ids.has(c.id))].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [options, created])
  const selected = value ? (all.find((o) => o.id === value) ?? null) : null

  const [text, setText] = React.useState(selected?.name ?? "")
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState("")
  const [notice, setNotice] = React.useState<Notice>(null)
  const [pending, startTransition] = React.useTransition()
  const [activeId, setActiveId] = React.useState<string | undefined>(undefined)
  const [listId, setListId] = React.useState<string | undefined>(undefined)
  const listRef = React.useRef<HTMLDivElement>(null)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  // Valor trocado de fora (reset do formulário, rascunho restaurado): o texto acompanha.
  const selectedName = selected?.name ?? null
  const typing = React.useRef(false)
  React.useEffect(() => {
    if (typing.current) {
      typing.current = false
      return
    }
    setText(selectedName ?? "")
    setNotice(null)
  }, [value, selectedName])

  const query = cleanCentralName(text)
  const slug = centralSlug(query)
  const exact = slug ? all.find((o) => centralSlug(o.name) === slug) : undefined
  const matches = all.filter((o) => matchesCentral(o.name, query))
  const shown = exact && !matches.includes(exact) ? [exact, ...matches] : matches
  const showCreate = canCreate && slug !== "" && !exact
  const items = [...shown.map((o) => o.id), ...(showCreate ? [CREATE] : [])]
  const itemsKey = items.join("|")

  // Destaque sempre num item visível: o primeiro, quando o atual sumiu do filtro.
  React.useEffect(() => {
    const visible = itemsKey ? itemsKey.split("|") : []
    if (!visible.includes(highlight)) setHighlight(visible[0] ?? "")
  }, [itemsKey, highlight])

  // aria-activedescendant / aria-controls: os ids vêm do cmdk depois de renderizar.
  React.useEffect(() => {
    if (!open) return setActiveId(undefined)
    const list = listRef.current
    setListId(list?.id || undefined)
    const item = list?.querySelector<HTMLElement>(`[cmdk-item][data-value="${CSS.escape(highlight)}"]`)
    setActiveId(item?.id || undefined)
  }, [open, highlight, itemsKey])

  function choose(option: CentralOption, typed?: string) {
    setText(option.name)
    setOpen(false)
    setNotice(typed && cleanCentralName(typed) !== option.name ? { tone: "info", text: fill(C.usingExisting, { name: option.name }) } : null)
    if (option.id !== value) onValueChange(option.id)
  }

  function create() {
    const typed = query
    startTransition(async () => {
      const result = await createCentral({ name: typed })
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error })
        return
      }
      const option = { id: result.id, name: result.name }
      setCreated((list) => (list.some((c) => c.id === option.id) ? list : [...list, option]))
      onCreate?.(option)
      choose(option, typed)
    })
  }

  function pick(item: string) {
    if (item === CREATE) return create()
    const option = all.find((o) => o.id === item)
    if (option) choose(option, query)
  }

  // As teclas da lista vêm antes das do formulário (ex.: Enter que acrescenta linha na daily).
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) return setOpen(true)
      const index = items.indexOf(highlight)
      const step = event.key === "ArrowDown" ? 1 : -1
      setHighlight(items[(index + step + items.length) % items.length] ?? "")
    } else if (event.key === "Enter" && open && highlight && !event.ctrlKey && !event.metaKey) {
      // Lista aberta: Enter escolhe e não chega ao formulário (não salva, não acrescenta linha).
      event.preventDefault()
      event.stopPropagation()
      pick(highlight)
    } else if (event.key === "Escape" && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else {
      inputProps.onKeyDown?.(event)
    }
  }

  // Saiu do campo sem escolher: o mesmo nome normalizado escolhe a existente; outro texto fica avisado.
  function onBlur(event: React.FocusEvent<HTMLInputElement>) {
    inputProps.onBlur?.(event)
    setOpen(false)
    if (value || pending || query === "") return
    if (exact) choose(exact, query)
    else setNotice({ tone: "error", text: C.notSaved })
  }

  return (
    <div ref={wrapperRef} className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Popover open={open && (items.length > 0 || all.length === 0)} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <input
              {...inputProps}
              type="text"
              role="combobox"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={activeId}
              aria-busy={pending || undefined}
              placeholder={placeholder}
              value={pending ? C.creating : text}
              readOnly={pending}
              className={cn(controlClasses, "h-9 px-2.5", value ? "pr-8" : null, inputClassName)}
              onChange={(event) => {
                setText(event.target.value)
                setOpen(true)
                setNotice(null)
                if (value) {
                  typing.current = true
                  onValueChange(null)
                }
              }}
              onClick={() => setOpen(true)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
            />
            {value && !pending ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={C.clear}
                className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ink-secondary hover:text-ink"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setText("")
                  setNotice(null)
                  onValueChange(null)
                }}
              >
                <XIcon className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-56 gap-0 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Clicar na lista não tira o foco do campo.
          onMouseDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (wrapperRef.current?.contains(event.target as Node)) event.preventDefault()
          }}
        >
          <Command shouldFilter={false} value={highlight} onValueChange={setHighlight} label={C.searchLabel}>
            <CommandList ref={listRef}>
              {all.length === 0 && !showCreate ? (
                <p className="px-2 py-3 text-sm text-ink-secondary">{C.noneActive}</p>
              ) : null}
              {shown.map((option) => (
                <CommandItem key={option.id} value={option.id} onSelect={() => pick(option.id)}>
                  <span className="truncate">{option.name}</span>
                </CommandItem>
              ))}
              {showCreate ? (
                <CommandItem value={CREATE} onSelect={() => pick(CREATE)}>
                  <PlusIcon aria-hidden />
                  <span className="truncate">{fill(C.create, { name: query })}</span>
                </CommandItem>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {notice ? (
        <p role={notice.tone === "error" ? "alert" : "status"} className={cn("text-xs", notice.tone === "error" ? "text-overdue" : "text-ink-secondary")}>
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}
