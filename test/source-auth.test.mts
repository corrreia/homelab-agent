import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthHeaders, encodeBasic } from '../src/lib/source-auth.ts'
import { templateAuth, type ServiceTemplate } from '../src/lib/templates.ts'

const BASE: ServiceTemplate = {
  id: 't',
  name: 'T',
  description: '',
  defaultSlug: 't',
  bundledSpec: 't.json',
  authType: 'none',
  urlPlaceholder: '',
  tokenLabel: '',
  logo: '',
  color: '',
  testEndpoint: '/',
}

const template = (over: Partial<ServiceTemplate>): ServiceTemplate => ({ ...BASE, ...over })

test('encodeBasic: RFC 7617 base64 of user:password', () => {
  assert.equal(encodeBasic('admin', 'hunter2'), Buffer.from('admin:hunter2').toString('base64'))
  assert.equal(encodeBasic('admin', 'hunter2'), 'YWRtaW46aHVudGVyMg==')
})

test('encodeBasic: passwords containing a colon stay intact (only the first splits)', () => {
  const decoded = Buffer.from(encodeBasic('admin', 'a:b:c'), 'base64').toString('utf8')

  assert.equal(decoded, 'admin:a:b:c')
})

test('encodeBasic: non-ASCII credentials encode as UTF-8', () => {
  const decoded = Buffer.from(encodeBasic('tomás', 'señha'), 'base64').toString('utf8')

  assert.equal(decoded, 'tomás:señha')
})

test('buildAuthHeaders: one shape per auth type', () => {
  assert.deepEqual(buildAuthHeaders({ type: 'bearer', token: 'abc' }), { Authorization: 'Bearer abc' })
  assert.deepEqual(buildAuthHeaders({ type: 'header', name: 'X-Api-Key', value: 'k' }), { 'X-Api-Key': 'k' })
  assert.deepEqual(buildAuthHeaders({ type: 'basic', username: 'u', password: 'p' }), {
    Authorization: `Basic ${encodeBasic('u', 'p')}`,
  })
  assert.deepEqual(buildAuthHeaders({ type: 'none' }), {})
})

test('buildAuthHeaders: incomplete credentials send nothing rather than a broken header', () => {
  assert.deepEqual(buildAuthHeaders({ type: 'bearer' }), {})
  assert.deepEqual(buildAuthHeaders({ type: 'header', name: 'X-Api-Key' }), {})
  assert.deepEqual(buildAuthHeaders({ type: 'basic' }), {})
})

test('buildAuthHeaders: a blank basic password is still a valid credential', () => {
  assert.deepEqual(buildAuthHeaders({ type: 'basic', username: 'u' }), {
    Authorization: `Basic ${encodeBasic('u', '')}`,
  })
})

test('templateAuth: header templates apply the declared value prefix', () => {
  const gitea = template({ authType: 'header', authHeaderName: 'Authorization', authValuePrefix: 'token ' })

  assert.deepEqual(templateAuth(gitea, { token: 'pat123' }), {
    type: 'header',
    name: 'Authorization',
    value: 'token pat123',
  })
})

test('templateAuth: no prefix declared means the secret is sent verbatim', () => {
  const sonarr = template({ authType: 'header', authHeaderName: 'X-Api-Key' })

  assert.deepEqual(templateAuth(sonarr, { token: 'k' }), { type: 'header', name: 'X-Api-Key', value: 'k' })
})

test('templateAuth: a blank secret leaves the value undefined so an edit keeps the stored one', () => {
  const gitea = template({ authType: 'header', authHeaderName: 'Authorization', authValuePrefix: 'token ' })

  assert.equal(templateAuth(gitea, { token: '' }).value, undefined)
  assert.equal(templateAuth(template({ authType: 'bearer' }), { token: '' }).token, undefined)
  assert.equal(templateAuth(template({ authType: 'basic' }), { username: 'u', password: '' }).password, undefined)
})

test('templateAuth: basic templates carry username and password', () => {
  const adguard = template({ authType: 'basic' })

  assert.deepEqual(templateAuth(adguard, { username: 'admin', password: 'pw' }), {
    type: 'basic',
    username: 'admin',
    password: 'pw',
  })
})
