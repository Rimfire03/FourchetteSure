import Dexie, { type Table } from 'dexie'
import type { Frequency } from './logic'

export type Role = 'admin' | 'manager' | 'agent' | 'viewer'
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrateur', manager: 'Responsable de cuisine', agent: 'Agent de cuisine', viewer: 'Consultation',
}
interface Base { id: string; etabId: string; createdAt: number }

export interface User extends Base { name: string; role: Role; pinHash: string; active: boolean }
export interface Reminder extends Base {
  key: string; title: string; time: string; days: number[] // JS getDay(): 0=dimanche
  kind: 'plat_temoin' | 'generic'; photoRequired: boolean; enabled: boolean; valueLabel?: string; assignedTo: string[]
}
export interface TaskLog extends Base {
  reminderId: string; title: string; date: string; userId: string; userName: string
  dishes?: string[]; servedDate?: string; disposeAfter?: string; value?: string; note?: string; photoIds: string[]
}
export interface MeatOrigin { born?: string; raised?: string; slaughtered?: string; cut?: string; origin?: string }
export type ProdCat = 'frais' | 'surgele' | 'sec' | 'conserve'
export const PROD_CAT_LABEL: Record<ProdCat, string> = { frais: 'Produits frais', surgele: 'Produits surgelés', sec: 'Produits secs', conserve: 'Conserves' }
export interface Product extends Base {
  name: string; category: ProdCat; dlcType: 'DLC' | 'DDM'; dlc?: string; lot: string; supplier?: string; country?: string
  isMeat: boolean; meat?: MeatOrigin; pouches: number; photoIds: string[]; userId: string; userName: string; openedAt: number; ocrText?: string
}
export interface Check { key: string; label: string; value: 'oui' | 'non' | 'na' }
export interface Temp { type: string; product: string; celsius: number; photoId?: string }
export type Decision = 'accepte' | 'refuse' | 'reserve'
export interface Delivery extends Base {
  supplier: string; driver?: string; bl: string; userId: string; userName: string
  photoIds: string[]; blPhotoIds: string[]; checks: Check[]; temps: Temp[]
  anomaly?: { description: string; photoIds: string[]; decision: Decision; corrective: string; responsible: string }
}
export interface CleaningItem extends Base {
  zone: string; frequency: Frequency; customDays?: number; photoRequired: boolean; product?: string; dilution?: string
  contactMin?: string; rinse: boolean; active: boolean; createdYmd: string
}
export interface CleaningLog extends Base {
  itemId: string; zone: string; date: string; userId: string; userName: string; product?: string; dilution?: string
  contactMin?: string; rinsed: boolean; photoIds: string[]
}
export interface OpenRef extends Base { name: string; family: string; days?: number; tempC?: string; conditions?: string; source?: string }
export interface OpenedItem extends Base {
  refId?: string; name: string; openedAt: number; openedYmd: string; days: number; dueYmd: string; quantity: string
  tempC?: string; userId: string; userName: string; status: 'open' | 'finished' | 'discarded'; closedAt?: number; closedBy?: string
}
export interface Photo { id: string; blob: Blob; createdAt: number }
export interface AuditRow { id: string; etabId: string; at: number; userId: string; userName: string; entity: string; entityId: string; action: string; detail: string }
export interface RegSheet extends Base { theme: string; title: string; explanation: string; rule: string; example: string; reference: string; updated: string }
export interface Setting { key: string; value: unknown }

class KitchenDB extends Dexie {
  users!: Table<User, string>; reminders!: Table<Reminder, string>; taskLogs!: Table<TaskLog, string>
  products!: Table<Product, string>; deliveries!: Table<Delivery, string>; cleaningItems!: Table<CleaningItem, string>
  cleaningLogs!: Table<CleaningLog, string>; openRefs!: Table<OpenRef, string>; opened!: Table<OpenedItem, string>
  photos!: Table<Photo, string>; audit!: Table<AuditRow, string>; regs!: Table<RegSheet, string>; settings!: Table<Setting, string>
  constructor() {
    super('suivi-cuisine')
    this.version(1).stores({
      users: 'id,etabId', reminders: 'id,etabId', taskLogs: 'id,date,reminderId,createdAt',
      products: 'id,name,lot,supplier,openedAt', deliveries: 'id,supplier,bl,createdAt',
      cleaningItems: 'id,etabId', cleaningLogs: 'id,itemId,date,createdAt', openRefs: 'id,name',
      opened: 'id,status,dueYmd,openedAt', photos: 'id', audit: 'id,at,entity,entityId', regs: 'id,theme', settings: 'key',
    })
  }
}
export const db = new KitchenDB()
