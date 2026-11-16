import { describe, it, expect } from 'vitest'
import { sampleDisposeDate, cleaningStatus, expiryState, parseLabel, addDays, reminderState, isNewer } from './logic'

describe('logic', () => {
  it('plat témoin: élimination J+5', () => expect(sampleDisposeDate('2026-11-16')).toBe('2026-11-21'))
  it('addDays passe le mois', () => expect(addDays('2026-11-29', 3)).toBe('2026-12-02'))
  it('nettoyage quotidien fait aujourd’hui = vert', () =>
    expect(cleaningStatus({ frequency: 'daily', createdYmd: '2026-11-01' }, '2026-11-16', '2026-11-16').light).toBe('green'))
  it('nettoyage quotidien fait hier = orange', () =>
    expect(cleaningStatus({ frequency: 'daily', createdYmd: '2026-11-01' }, '2026-11-15', '2026-11-16').light).toBe('orange'))
  it('nettoyage hebdo fait il y a 9 jours = rouge', () =>
    expect(cleaningStatus({ frequency: 'weekly', createdYmd: '2026-11-01' }, '2026-11-07', '2026-11-16').light).toBe('red'))
  it('jamais fait, créé aujourd’hui = orange', () =>
    expect(cleaningStatus({ frequency: 'monthly', createdYmd: '2026-11-16' }, undefined, '2026-11-16').light).toBe('orange'))
  it('expiry', () => {
    expect(expiryState('2026-11-18', '2026-11-16')).toBe('ok')
    expect(expiryState('2026-11-17', '2026-11-16')).toBe('eve')
    expect(expiryState('2026-11-16', '2026-11-16')).toBe('today')
    expect(expiryState('2026-11-15', '2026-11-16')).toBe('expired')
  })
  it('reminder', () => {
    expect(reminderState('11:30', false, '11:29')).toBe('pending')
    expect(reminderState('11:30', false, '11:30')).toBe('late')
    expect(reminderState('11:30', true, '12:00')).toBe('done')
  })
  it('isNewer', () => {
    expect(isNewer('v0.0.2', '0.0.1')).toBe(true)
    expect(isNewer('0.1.0', '0.0.9')).toBe(true)
    expect(isNewer('0.0.1', '0.0.1')).toBe(false)
    expect(isNewer('0.0.1', '0.0.10')).toBe(false)
  })
  it('parseLabel', () => {
    const g = parseLabel('Jambon blanc supérieur\nÀ consommer jusqu\'au 24/11/2026\nLOT: L2311A\nÀ conserver entre 0°C et +4°C')
    expect(g.name).toBe('Jambon blanc supérieur')
    expect(g.dlc).toBe('2026-11-24')
    expect(g.lot).toBe('L2311A')
    expect(g.storage).toMatch(/0°C/)
  })
})
