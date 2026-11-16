import { useState } from 'react'
import { db } from '../lib/db'
import { frDate, frDateTime, ymd } from '../lib/logic'
import { photoDataUrl } from '../lib/store'
import { Field, Page, useAuth } from '../ui'

interface Filters { from: string; to: string; supplier: string; product: string; lot: string }

export default function Export() {
  const { user } = useAuth()
  const [f, setF] = useState<Filters>({ from: ymd(new Date(Date.now() - 30 * 86_400_000)), to: ymd(new Date()), supplier: '', product: '', lot: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Filters, v: string) => setF({ ...f, [k]: v })
  return (
    <Page title="Dossier sanitaire">
      <p className="note">Génère un PDF : plats témoins, produits et étiquettes, réceptions et bons de livraison, nettoyages, dates après ouverture, non-conformités.</p>
      <div className="row"><Field label="Du"><input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></Field>
        <Field label="Au"><input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></Field></div>
      <Field label="Fournisseur (facultatif)"><input value={f.supplier} onChange={(e) => set('supplier', e.target.value)} /></Field>
      <Field label="Produit (facultatif)"><input value={f.product} onChange={(e) => set('product', e.target.value)} /></Field>
      <Field label="N° de lot (facultatif)"><input value={f.lot} onChange={(e) => set('lot', e.target.value)} /></Field>
      <button className="btn block" disabled={busy} onClick={async () => { setBusy(true); try { await buildPdf(f, user.name) } finally { setBusy(false) } }}>
        {busy ? 'Génération…' : '📄 Exporter mon dossier sanitaire (PDF)'}
      </button>
    </Page>
  )
}

const inc = (s: string | undefined, q: string) => !q || !!s?.toLowerCase().includes(q.toLowerCase())

async function buildPdf(f: Filters, by: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const t0 = new Date(f.from + 'T00:00:00').getTime()
  const t1 = new Date(f.to + 'T23:59:59').getTime()
  const inRange = (ms: number) => ms >= t0 && ms <= t1
  const etab = ((await db.settings.get('etabName'))?.value as string) ?? ''

  const [tasks, products, deliveries, cleans, opened, audit] = await Promise.all([
    db.taskLogs.toArray(), db.products.toArray(), db.deliveries.toArray(), db.cleaningLogs.toArray(), db.opened.toArray(), db.audit.toArray(),
  ])
  const T = tasks.filter((x) => inRange(x.createdAt) && !f.supplier && !f.product && !f.lot)
  const P = products.filter((x) => inRange(x.createdAt) && inc(x.supplier, f.supplier) && inc(x.name, f.product) && inc(x.lot, f.lot))
  const D = deliveries.filter((x) => inRange(x.createdAt) && inc(x.supplier, f.supplier) && !f.lot && !f.product)
  const C = cleans.filter((x) => inRange(x.createdAt) && !f.supplier && !f.product && !f.lot)
  const O = opened.filter((x) => inRange(x.createdAt) && inc(x.name, f.product) && !f.supplier && !f.lot)

  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  let y = 20
  doc.setFontSize(18); doc.text('Dossier sanitaire', 14, y)
  doc.setFontSize(10); y += 7
  doc.text(`${etab} — période du ${frDate(f.from)} au ${frDate(f.to)}`, 14, y); y += 5
  doc.text(`Édité le ${frDateTime(Date.now())} par ${by}`, 14, y)
  const filt = [f.supplier && `fournisseur « ${f.supplier} »`, f.product && `produit « ${f.product} »`, f.lot && `lot « ${f.lot} »`].filter(Boolean).join(', ')
  if (filt) { y += 5; doc.text(`Filtres : ${filt}`, 14, y) }
  y += 4

  const heading = (title: string) => {
    if (y > H - 40) { doc.addPage(); y = 20 }
    doc.setFontSize(13); doc.setTextColor(31, 122, 77); doc.text(title, 14, y + 6); doc.setTextColor(0); y += 9
  }
  const table = (head: string[], body: string[][]) => {
    if (!body.length) { doc.setFontSize(9); doc.text('Aucune donnée sur la période.', 14, y + 4); y += 8; return }
    autoTable(doc, { startY: y, head: [head], body, styles: { fontSize: 8 }, headStyles: { fillColor: [31, 122, 77] }, margin: { left: 14, right: 14 } })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
  }
  const photos = async (label: string, ids: string[]) => {
    if (!ids.length) return
    doc.setFontSize(8)
    if (y > H - 50) { doc.addPage(); y = 20 }
    doc.text(label, 14, y + 3); y += 5
    let x = 14
    for (const id of ids) {
      const url = await photoDataUrl(id)
      if (!url) continue
      if (x + 36 > W - 10) { x = 14; y += 38 }
      if (y > H - 45) { doc.addPage(); y = 20; x = 14 }
      try { doc.addImage(url, 'JPEG', x, y, 34, 34) } catch { /* format non supporté */ }
      x += 37
    }
    y += 38
  }

  heading('1. Plats témoins et rappels journaliers')
  table(['Date/heure', 'Tâche', 'Agent', 'Plats / valeur', 'Élimination possible'],
    T.map((x) => [frDateTime(x.createdAt), x.title, x.userName, [x.dishes?.join(', '), x.value].filter(Boolean).join(' '), x.disposeAfter ? frDate(x.disposeAfter) : '']))
  for (const x of T) await photos(`${x.title} — ${frDateTime(x.createdAt)}`, x.photoIds)

  heading('2. Traçabilité des produits')
  table(['Ouverture', 'Produit', 'Date', 'Lot', 'Fournisseur', 'Origine', 'Agent'],
    P.map((x) => [frDateTime(x.openedAt), x.name, `${x.dlcType} ${frDate(x.dlc)}`, x.lot, x.supplier ?? '', x.isMeat && x.meat ? `né ${x.meat.born ?? '-'} / élevé ${x.meat.raised ?? '-'} / abattu ${x.meat.slaughtered ?? '-'} / découpé ${x.meat.cut ?? '-'}` : x.country ?? '', x.userName]))
  for (const x of P) await photos(`Étiquette ${x.name} (lot ${x.lot})`, x.photoIds)

  heading('3. Contrôles de réception')
  table(['Date/heure', 'Fournisseur', 'BL', 'Agent', 'Températures', 'Résultat'],
    D.map((x) => [frDateTime(x.createdAt), x.supplier, x.bl, x.userName, x.temps.map((t) => `${t.product} ${t.celsius}°C`).join('; '), x.anomaly ? 'NON-CONFORME' : 'Conforme']))
  for (const x of D) await photos(`Livraison ${x.supplier} — bon ${x.bl}`, [...x.photoIds, ...x.blPhotoIds])

  heading('4. Non-conformités et mesures correctives')
  table(['Date', 'Fournisseur', 'Problème', 'Décision', 'Mesures', 'Responsable'],
    D.filter((x) => x.anomaly).map((x) => [frDateTime(x.createdAt), x.supplier, x.anomaly!.description, x.anomaly!.decision, x.anomaly!.corrective, x.anomaly!.responsible]))
  for (const x of D.filter((d) => d.anomaly)) await photos(`Anomalie ${x.supplier}`, x.anomaly!.photoIds)

  heading('5. Plan de nettoyage réalisé')
  table(['Date/heure', 'Zone', 'Agent', 'Produit', 'Dilution', 'Contact', 'Rinçage'],
    C.map((x) => [frDateTime(x.createdAt), x.zone, x.userName, x.product ?? '', x.dilution ?? '', x.contactMin ?? '', x.rinsed ? 'oui' : 'non']))
  for (const x of C.filter((c) => c.photoIds.length)) await photos(`Nettoyage ${x.zone} — ${frDateTime(x.createdAt)}`, x.photoIds)

  heading('6. Dates après ouverture')
  table(['Ouverture', 'Produit', 'Limite', 'Quantité', 'Agent', 'Statut'],
    O.map((x) => [frDateTime(x.openedAt), x.name, frDate(x.dueYmd), x.quantity, x.userName, x.status === 'open' ? 'ouvert' : x.status === 'finished' ? 'terminé' : 'jeté']))

  heading('7. Historique de validation et corrections')
  table(['Date/heure', 'Utilisateur', 'Objet', 'Action', 'Détail'],
    audit.filter((a) => inRange(a.at) && a.action !== 'connexion').sort((a, b) => a.at - b.at).slice(-300)
      .map((a) => [frDateTime(a.at), a.userName, a.entity, a.action, a.detail.slice(0, 90)]))

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(`Page ${i}/${n}`, W - 25, H - 8) }
  doc.save(`dossier-sanitaire-${f.from}-${f.to}.pdf`)
}
