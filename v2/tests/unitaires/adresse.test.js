import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adresseSansSecret } from '../../application/serveur/adresse.js'

test('journal : les secrets des adresses sont masqués (lien de connexion, connecteur Claude)', () => {
  assert.equal(adresseSansSecret('/api/connexion/abc123?x=1'), '/api/connexion/***?x=1')
  assert.equal(adresseSansSecret('/api/mcp/Zx9_secret-long'), '/api/mcp/***')
  assert.equal(adresseSansSecret('/api/documents/abc'), '/api/documents/abc')
})
