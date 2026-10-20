/**
 * Superfície do colaborador (P25, D45): layout PRÓPRIO, sem o shell do gestor — sem
 * sidebar, barra de contexto, command palette, busca ou seletor de time. Projetado
 * a 390px primeiro: coluna única de leitura, que só folga no desktop.
 */
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-canvas">
      <main className="mx-auto flex w-full max-w-reading flex-col gap-8 px-4 py-4 sm:py-8">{children}</main>
    </div>
  )
}
