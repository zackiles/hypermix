import { assertEquals } from './test-utils.ts'
import type { RepomixConfig } from '../src/types.ts'

// Simplified function for normalizing GitHub URLs
function normalizeGitHubUrl(url?: string): string | undefined {
  if (!url) return undefined
  return url.startsWith('http') ? url : `https://github.com/${url}`
}

// Simplified function for extracting repository name from URL
function extractRepoName(url?: string): string {
  if (!url) return 'unknown'
  if (!url.includes('github.com')) return 'local codebase'

  const parts = url.replace('https://github.com/', '').split('/')
  return parts.length >= 2 ? parts[1] : 'unknown'
}

// Simplified version of output path generation from GitHub URL
function outputFromGithub(url?: string): string {
  if (!url || !url.includes('github.com')) return 'snapshot.xml'

  const parts = url.replace('https://github.com/', '').split('/')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}.xml` : 'snapshot.xml'
}

Deno.test('normalizeGitHubUrl - handles owner/repo format', () => {
  const url = 'owner/repo'
  const normalized = normalizeGitHubUrl(url)
  assertEquals(normalized, 'https://github.com/owner/repo')
})

Deno.test('normalizeGitHubUrl - handles full GitHub URL', () => {
  const url = 'https://github.com/owner/repo'
  const normalized = normalizeGitHubUrl(url)
  assertEquals(normalized, 'https://github.com/owner/repo')
})

Deno.test('normalizeGitHubUrl - handles undefined', () => {
  const normalized = normalizeGitHubUrl(undefined)
  assertEquals(normalized, undefined)
})

Deno.test('extractRepoName - extracts from owner/repo format', () => {
  const url = 'owner/repo'
  const normalized = normalizeGitHubUrl(url)
  const repoName = extractRepoName(normalized)
  assertEquals(repoName, 'repo')
})

Deno.test('extractRepoName - extracts from full GitHub URL', () => {
  const url = 'https://github.com/owner/repo'
  const repoName = extractRepoName(url)
  assertEquals(repoName, 'repo')
})

Deno.test('extractRepoName - handles non-GitHub URLs', () => {
  const url = 'https://example.com/repo'
  const repoName = extractRepoName(url)
  assertEquals(repoName, 'local codebase')
})

Deno.test('extractRepoName - handles undefined', () => {
  const repoName = extractRepoName(undefined)
  assertEquals(repoName, 'unknown')
})

Deno.test('outputFromGithub - generates output path from owner/repo format', () => {
  const url = 'owner/repo'
  const normalized = normalizeGitHubUrl(url)
  const outputPath = outputFromGithub(normalized)
  assertEquals(outputPath, 'owner-repo.xml')
})

Deno.test('outputFromGithub - generates output path from full GitHub URL', () => {
  const url = 'https://github.com/owner/repo'
  const outputPath = outputFromGithub(url)
  assertEquals(outputPath, 'owner-repo.xml')
})

Deno.test('outputFromGithub - handles non-GitHub URLs', () => {
  const url = 'https://example.com/repo'
  const outputPath = outputFromGithub(url)
  assertEquals(outputPath, 'snapshot.xml')
})

Deno.test('outputFromGithub - handles undefined', () => {
  const outputPath = outputFromGithub(undefined)
  assertEquals(outputPath, 'snapshot.xml')
})

// Test multiple URL formats using RepomixConfig type
Deno.test('RepomixConfig - handles various URL formats', () => {
  const configs: RepomixConfig[] = [
    { remote: 'owner/repo' },
    { remote: 'https://github.com/owner/repo' },
    { remote: undefined },
    { remote: 'owner/repo-with-dash' },
    { remote: 'owner/repo/with/extra/parts' },
  ]

  const normalized = configs.map((config) => normalizeGitHubUrl(config.remote))

  assertEquals(normalized[0], 'https://github.com/owner/repo')
  assertEquals(normalized[1], 'https://github.com/owner/repo')
  assertEquals(normalized[2], undefined)
  assertEquals(normalized[3], 'https://github.com/owner/repo-with-dash')
  assertEquals(normalized[4], 'https://github.com/owner/repo/with/extra/parts')

  const repoNames = configs.map((config) => {
    const normalized = normalizeGitHubUrl(config.remote)
    return extractRepoName(normalized)
  })

  assertEquals(repoNames[0], 'repo')
  assertEquals(repoNames[1], 'repo')
  assertEquals(repoNames[2], 'unknown')
  assertEquals(repoNames[3], 'repo-with-dash')
  assertEquals(repoNames[4], 'repo')
})
