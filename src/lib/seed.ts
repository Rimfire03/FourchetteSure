import { db, type CleaningItem, type OpenRef, type Reminder, type RegSheet } from './db'
import { ymd } from './logic'
import { uid } from './store'

const WEEK = [1, 2, 3, 4, 5]
const REG_DATE = '2026-11-16'

const reminders = (etabId: string): Reminder[] => {
  const r = (key: string, title: string, time: string, o: Partial<Reminder> = {}): Reminder => ({
    id: uid(), etabId, createdAt: Date.now(), key, title, time, days: WEEK, kind: 'generic',
    photoRequired: false, enabled: false, assignedTo: [], ...o,
  })
  return [
    r('plat_temoin', 'Prélèvement des plats témoins', '11:30', { kind: 'plat_temoin', photoRequired: true, enabled: true }),
    r('temp_frigo', 'Température des réfrigérateurs', '08:00', { valueLabel: 'Température (°C)' }),
    r('temp_congel', 'Température des congélateurs', '08:05', { valueLabel: 'Température (°C)' }),
    r('temp_chaud', 'Température des plats chauds', '11:45', { valueLabel: 'Température (°C)' }),
    r('nettoyage_jour', 'Nettoyage quotidien', '14:30'),
    r('huile', 'Contrôle des huiles de friture', '10:00', { valueLabel: 'Taux de composés polaires (%)' }),
    r('dlc', 'Contrôle des dates limites des produits', '09:00'),
  ]
}

// Fréquences = propositions de départ, pas des fréquences réglementaires.
const cleaning = (etabId: string): CleaningItem[] => {
  const c = (zone: string, frequency: CleaningItem['frequency'], customDays?: number): CleaningItem => ({
    id: uid(), etabId, createdAt: Date.now(), zone, frequency, customDays, photoRequired: false, rinse: true, active: true, createdYmd: ymd(new Date()),
  })
  return [
    c('Plans de travail', 'multi'), c('Planches à découper', 'multi'), c('Couteaux et ustensiles', 'multi'),
    c('Sols de cuisine', 'daily'), c('Tables de préparation', 'daily'), c('Éviers et lavabos', 'daily'), c('Poignées et interrupteurs', 'daily'),
    c('Chambres froides', 'weekly'), c('Réfrigérateurs', 'weekly'), c('Congélateurs', 'monthly'),
    c('Filtres de hotte', 'custom', 30), c('Murs et plafonds', 'custom', 90), c('Réserves sèches', 'monthly'),
    c('Canalisations et siphons', 'custom', 7), c('Nettoyage approfondi des équipements', 'custom', 90),
  ]
}

// Durées volontairement vides : à renseigner d'après l'étiquette fabricant ou la procédure validée.
const openRefs = (etabId: string): OpenRef[] => {
  const o = (family: string, name: string, source: string): OpenRef => ({ id: uid(), etabId, createdAt: Date.now(), family, name, source })
  return [
    o('Crèmerie', 'Crème fraîche', 'Selon fabricant'), o('Crèmerie', 'Lait UHT ouvert', 'Selon fabricant'),
    o('Crèmerie', 'Fromage râpé', 'Selon fabricant'), o('Crèmerie', 'Beurre', 'Selon fabricant'),
    o('Charcuterie', 'Jambon ouvert', 'Selon fabricant'), o('Charcuterie', 'Saucisson entamé', 'Selon fabricant'),
    o('Sauces', 'Mayonnaise', 'Selon fabricant'), o('Sauces', 'Ketchup', 'Selon fabricant'), o('Sauces', 'Moutarde', 'Selon fabricant'),
    o('Conserves', 'Maïs en boîte ouvert', 'Selon procédure validée'), o('Conserves', 'Haricots verts ouverts', 'Selon procédure validée'),
    o('Surgelés', 'Produit décongelé', 'Selon étiquette et procédure'), o('Épicerie', 'Produits secs ouverts', 'Selon fabricant'),
  ]
}

const AM = 'Arrêté du 21 décembre 2009, annexe IV'
const regs = (etabId: string): RegSheet[] => {
  const s = (theme: string, title: string, explanation: string, rule: string, example: string, reference: string): RegSheet =>
    ({ id: uid(), etabId, createdAt: Date.now(), theme, title, explanation, rule, example, reference, updated: REG_DATE })
  return [
    s('Remise en température', 'Remise en température des plats chauds',
      'Un plat préparé à l’avance puis refroidi doit être réchauffé vite et assez haut avant d’être servi.',
      'Atteindre au minimum 63 °C. Le passage de +10 °C à la température de remise au consommateur ne dépasse pas 1 heure. Consommer le jour de la première remise en température. Ce n’est pas le simple maintien au chaud.',
      'Gratin sorti à +4 °C à 10 h 30 : il doit être à ≥ 63 °C avant 11 h 30.', AM),
    s('Refroidissement', 'Refroidissement rapide',
      'Un plat cuit destiné à être servi froid ou à être conservé doit descendre vite en température.',
      'Passer de +63 °C à +10 °C en 2 heures maximum, puis conserver entre 0 et +3 °C. Dérogation possible uniquement sur la base d’une analyse des dangers validée.',
      'Compote cuite à 12 h 00 : ≤ +10 °C à 14 h 00, puis au froid 0/+3 °C.', AM),
    s('Plats témoins', 'Prélèvement et conservation des plats témoins',
      'Échantillons représentatifs des plats distribués, pour enquête en cas d’intoxication.',
      'Représentatifs, clairement identifiés (date, plat), conservés au moins 5 jours après le dernier repas servi, au froid positif entre 0 et +3 °C. Obligations différentes selon cuisine centrale / restaurant satellite.',
      'Plat servi le lundi 16/11 : conservé jusqu’au samedi 21/11 au plus tôt pour l’élimination.', AM),
    s('Conservation', 'Températures de conservation maximales',
      'Chaque famille de denrées a sa température maximale. Ne jamais appliquer une température unique.',
      'Viande hachée +2 °C · Abats +3 °C · Préparations de viandes +4 °C · Volailles +4 °C · Morceaux de viande découpés +4 °C · Poissons frais +2 °C · Préparations culinaires élaborées à l’avance +3 °C · Plats en liaison chaude : +63 °C minimum. Vérifier la catégorie exacte dans les textes.',
      'Un steak haché livré à +5 °C est non conforme.', AM + ' (art. 3 et annexes)'),
    s('Hygiène du personnel', 'Hygiène du personnel', 'Le personnel est une source de contamination.',
      'Lavage des mains à chaque reprise de poste, après les toilettes, après manipulation de déchets ou de denrées crues. Tenue propre dédiée. Blessure : pansement étanche + gant. Signaler toute maladie digestive.',
      'Se laver les mains avant de passer des légumes aux plats cuits.', 'Règlement CE 852/2004, annexe II ch. VIII'),
    s('Hygiène des locaux', 'Nettoyage et désinfection', 'Des locaux propres réduisent les risques.',
      'Suivre le plan de nettoyage : zone, fréquence, produit, dilution, temps de contact, rinçage. Tracer chaque opération.',
      'Plan de travail : nettoyer, rincer, désinfecter, rincer après chaque usage.', 'Règlement CE 852/2004 ; PMS'),
    s('Contamination croisée', 'Séparation cru / cuit', 'Éviter de transférer des germes du cru vers le cuit.',
      'Matériel, planches et couteaux dédiés ou nettoyés/désinfectés entre usages. Marche en avant. Stocker cru en dessous, cuit au-dessus.',
      'Poulet cru en bas du frigo, desserts en haut.', 'Règlement CE 852/2004'),
    s('Allergènes', 'Allergènes', 'Les 14 allergènes à déclaration obligatoire doivent être connus et signalés.',
      'Identifier les allergènes de chaque recette, conserver les étiquettes, informer les convives. Éviter les contaminations croisées.',
      'Garder l’étiquette de la sauce contenant de la moutarde / du lait.', 'Règlement UE 1169/2011'),
    s('Traçabilité', 'Traçabilité', 'Savoir d’où vient chaque produit et où il est allé.',
      'Conserver étiquettes, numéros de lot, fournisseurs, bons de livraison. Pouvoir retrouver tous les produits d’un lot en cas de rappel.',
      'Rappel conso sur un lot de fromage : chercher le lot dans l’application.', 'Règlement CE 178/2002, art. 18'),
    s('Réception', 'Contrôle à réception', 'Le contrôle à la livraison démarre la maîtrise sanitaire.',
      'Vérifier emballages, DLC, températures, quantités, numéros de lot, chaîne du froid. Photographier livraison et bon. Anomalie : décider, tracer, corriger.',
      'Camion non réfrigéré, produit à +9 °C : refuser et photographier.', 'PMS ; Règlement CE 852/2004'),
    s('Décongélation', 'Décongélation', 'La décongélation est une étape à risque.',
      'Décongeler au froid positif (0/+4 °C), pas à température ambiante. Ne jamais recongeler un produit décongelé. Suivre l’étiquette et la procédure validée.',
      'Sortir la viande surgelée la veille au réfrigérateur.', 'PMS'),
    s('Gestion des déchets', 'Gestion des déchets', 'Les déchets attirent les nuisibles.',
      'Évacuer régulièrement, poubelles fermées, local déchets nettoyé, circuit séparé des denrées propres.', 'Sortir les déchets après chaque service.', 'Règlement CE 852/2004'),
    s('Nuisibles', 'Lutte contre les nuisibles', 'Prévention et surveillance.',
      'Empêcher l’entrée (portes, grilles), ne pas laisser de nourriture, surveiller les pièges et signaler toute trace.', 'Trace de souris : prévenir le responsable et noter.', 'Règlement CE 852/2004'),
    s('TIAC', 'Suspicion de TIAC', 'Toxi-infection alimentaire collective : plusieurs cas après un même repas.',
      'Alerter le responsable, conserver les plats témoins sans les jeter, rassembler étiquettes et lots, relever les menus. La déclaration est obligatoire auprès de l’ARS / DDPP.',
      'Plusieurs enfants malades après le repas : garder les plats témoins.', 'Code de la santé publique, art. L3113-1'),
  ]
}

let seeding: Promise<void> | undefined
// Promise mémorisée : StrictMode lance l'effet deux fois, sans ça les données seraient en double.
export const seedIfEmpty = () => (seeding ??= doSeed())

async function doSeed() {
  const etabId = 'etab-1'
  await db.transaction('rw', [db.settings, db.reminders, db.cleaningItems, db.openRefs, db.regs], async () => {
    if (await db.settings.get('seeded')) return
    await db.settings.bulkPut([
      { key: 'etabId', value: etabId }, { key: 'etabName', value: 'Ma cantine' }, { key: 'seeded', value: true },
    ])
    await db.reminders.bulkAdd(reminders(etabId))
    await db.cleaningItems.bulkAdd(cleaning(etabId))
    await db.openRefs.bulkAdd(openRefs(etabId))
    await db.regs.bulkAdd(regs(etabId))
  })
}
