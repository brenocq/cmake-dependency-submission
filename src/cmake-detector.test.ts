import { extractFetchContentGitDetails } from './cmake-detector'

const fetchContentDataSimple = ['FetchContent_Declare(', 'GIT_REPOSITORY https://github.com/owner/repo', 'GIT_TAG v1.0.0', ')']
const fetchContentDataComment = ['FetchContent_Declare(', 'GIT_REPOSITORY https://github.com/owner/repo', 'GIT_TAG  v1.0.0 # release-1.0.0', ')']
const expectedResult = { repo: 'https://github.com/owner/repo', tag: 'v1.0.0' }

describe('extractFetchContentGitDetails', () => {
  test('Returns empty for no input', () => {
    expect(extractFetchContentGitDetails('')).toStrictEqual([])
  })

  test('Returns empty for invalid input', () => {
    expect(extractFetchContentGitDetails('Foo')).toStrictEqual([])
  })

  test('Returns empty for FetchContent_Declare without Git details', () => {
    expect(extractFetchContentGitDetails('FetchContent_Declare()')).toStrictEqual([])
  })

  test('Returns match for valid FetchContent_Declare', () => {
    expect(extractFetchContentGitDetails(fetchContentDataSimple.join('\n'))).toStrictEqual([expectedResult])
  })

  test('Returns matches for multiple FetchContent_Declares', () => {
    expect(extractFetchContentGitDetails((fetchContentDataSimple.concat(fetchContentDataSimple)).join('\n'))).toStrictEqual([expectedResult, expectedResult])
  })

  test('Returns matches for single-line FetchContent_Declare', () => {
    expect(extractFetchContentGitDetails('FetchContent_Declare(GIT_REPOSITORY https://github.com/owner/repo GIT_TAG v1.0.0)')).toStrictEqual([expectedResult])
  })

  test('Returns match for FetchContent_Declare with CRLF line endings', () => {
    expect(extractFetchContentGitDetails(fetchContentDataSimple.join('\r\n'))).toStrictEqual([expectedResult])
  })

  test('Returns match for FetchContent_Declare with comments', () => {
    expect(extractFetchContentGitDetails(fetchContentDataComment.join('\n'))).toStrictEqual([expectedResult])
  })
})
