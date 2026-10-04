/**
 * P18 — acessibilidade e mobile, verificações estáticas: contraste AA dos
 * tokens (texto 4,5:1, inclusive cor de severidade sobre o próprio wash),
 * texto terciário só onde a WCAG isenta (placeholder, desabilitado) ou em
 * gráfico, prefers-reduced-motion, alvos de toque de 44px, foco nunca
 * removido sem substituto, manifest sem service worker e /ui-lab fechado em
 * produção.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const css = readFileSync("src/app/globals.css", "utf8")
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")))
const token = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root)
  assert.ok(match, `token --${name}`)
  return match[1]!
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(token(a)), luminance(token(b))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe("contraste AA dos tokens", () => {
  const TEXT_PAIRS: [string, string][] = [
    ["ink", "canvas"],
    ["ink", "surface-sunken"],
    ["ink-secondary", "canvas"],
    ["ink-secondary", "surface"],
    ["ink-secondary", "surface-sunken"],
    ["ink-secondary", "accent-wash"],
    ["accent", "surface"],
    ["accent", "accent-wash"],
    ["surface", "accent"],
    ["surface", "overdue"],
    // Severidade: o texto do selo sobre o próprio wash e sobre a superfície.
    ["calm", "calm-wash"],
    ["calm", "surface"],
    ["attention", "attention-wash"],
    ["attention", "surface"],
    ["attention", "surface-sunken"],
    ["attention-strong", "attention-strong-wash"],
    ["attention-strong", "surface"],
    ["overdue", "overdue-wash"],
    ["overdue", "surface"],
    ["neutral", "neutral-wash"],
  ]
  for (const [fg, bg] of TEXT_PAIRS) {
    test(`--${fg} sobre --${bg} ≥ 4,5:1`, () => {
      const ratio = contrast(fg, bg)
      assert.ok(ratio >= 4.5, `${ratio.toFixed(2)}:1`)
    })
  }

  test("--ink-tertiary (3,2:1) não passa para texto: só placeholder, desabilitado ou ícone", () => {
    assert.ok(contrast("ink-tertiary", "surface") < 4.5)
    assert.ok(contrast("ink-tertiary", "surface") >= 3, "gráfico precisa de 3:1")
    const violations: string[] = []
    for (const file of walk("src")) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/(?<![:\w-])text-ink-tertiary/.test(line)) return
          if (/Icon|<svg/.test(line)) return
          violations.push(`${file}:${i + 1}`)
        })
    }
    assert.deepEqual(violations, [])
  })
})

describe("movimento, toque e foco", () => {
  test("prefers-reduced-motion desliga animação e transição", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"))
    assert.match(block, /animation: none !important/)
    assert.match(block, /transition: none !important/)
  })

  test("ponteiro grosso: ações com no mínimo 44px", () => {
    const block = css.slice(css.indexOf("@media (pointer: coarse)"))
    assert.match(block, /\[data-slot="button"\]/)
    assert.match(block, /min-height: 44px/)
    assert.match(block, /min-width: 44px/)
  })

  test("foco nunca é removido sem substituto visível", () => {
    const violations: string[] = []
    for (const file of walk("src")) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(/outline-none|outline-hidden/g)) {
        // Único caso: o campo da paleta, cujo foco é a barra de --accent na base do wrapper.
        const ok = file.replace(/\\/g, "/").endsWith("components/ui/command.tsx") && source.includes("has-[input:focus-visible]:after:bg-accent")
        if (!ok) violations.push(`${file}: ${match[0]}`)
      }
    }
    assert.deepEqual(violations, [])
    assert.match(css, /outline: 2px solid var\(--accent\)/)
  })
})

describe("instalação e produção", () => {
  test("manifest existe; nenhum service worker, cache offline ou sincronização", () => {
    const manifest = readFileSync("src/app/manifest.ts", "utf8")
    assert.match(manifest, /display: "standalone"/)
    assert.match(manifest, /lang: "pt-BR"/)
    const sources = walk("src").map((f) => readFileSync(f, "utf8")).join("\n")
    assert.ok(!/serviceWorker|caches\.open|workbox/.test(sources))
  })

  test("manifest e ícones ficam fora do middleware de login", () => {
    const middleware = readFileSync("src/middleware.ts", "utf8")
    for (const path of ["manifest.webmanifest", "icon.svg", "apple-icon.png", "icons/"]) assert.ok(middleware.includes(path), path)
  })

  test("/ui-lab responde 404 em produção", () => {
    assert.match(readFileSync("src/app/ui-lab/layout.tsx", "utf8"), /NODE_ENV === "production"\) notFound\(\)/)
  })

  test("HTML em pt-BR", () => {
    assert.match(readFileSync("src/app/layout.tsx", "utf8"), /<html lang="pt-BR"/)
  })
})
