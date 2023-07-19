import * as core from '@actions/core'
import { readFileSync } from 'fs';
import { globSync } from 'glob'
import { PackageURL } from 'packageurl-js'
import { URL } from 'url'
import {
    PackageCache,
    BuildTarget,
    Package,
    Snapshot,
    submitSnapshot
} from '@github/dependency-submission-toolkit'

type GitPair = { repo: string, tag: string }

function normalizeCMakeArgument(value: string): string {
    return value.replace(/[")]+/g, '')
}

function getArgumentForKeyword(keyword: string, line: string): string {
    const array = line.slice(line.indexOf(keyword)).split(/\s+/);
    return normalizeCMakeArgument(array[array.findIndex((value) => value == keyword) + 1])
}

export function extractFetchContentGitDetails(content: string): Array<GitPair> {
    let pairs: Array<GitPair> = []
    let readingFetch: boolean = false
    let repo: string | undefined = undefined
    let tag: string | undefined = undefined

    content.split(/\r?\n/).forEach((line) => {
        if (line.includes('FetchContent_Declare'))
            readingFetch = true;

        if (readingFetch) {
            const gitRepositoryKeyword = 'GIT_REPOSITORY'
            const gitTagKeword = 'GIT_TAG'

            if (line.includes(gitRepositoryKeyword))
                repo = getArgumentForKeyword(gitRepositoryKeyword, line)

            if (line.includes(gitTagKeword))
                tag = getArgumentForKeyword(gitTagKeword, line)

            if (line.includes(')')) {
                readingFetch = false;

                if (repo && tag) {
                    pairs.push({ repo: repo, tag: tag })
                    repo = undefined
                    tag = undefined
                }
            }
        }
    })

    return pairs
}

export function parseCMakeListsFiles(files: string[]): Array<GitPair> {
    let dependencies: Array<GitPair> = []

    files.forEach(file => {
        const content = readFileSync(file, 'utf-8');
        dependencies = dependencies.concat(extractFetchContentGitDetails(content))
    });

    return dependencies
}

export function parseNamespaceAndName(repo: string): [string, string] {
    const url = new URL(repo)
    const components = url.pathname.split('/').reverse()

    if (components.length > 2 && components[0].length > 0) {
        return [
            encodeURIComponent(components[1].toLowerCase()),
            encodeURIComponent(components[0].replace('.git', '').toLowerCase())
        ]
    }

    throw new Error(
      `expectation violated: Git URL '${repo}' has an invalid format`
    )
}

export function parsePackageType(repo: string): string {
    const purlTypes = ['github', 'bitbucket'] // From: https://github.com/package-url/purl-spec/blob/master/PURL-TYPES.rst
    const url = new URL(repo)

    for (const type of purlTypes)
        if (url.hostname.includes(type))
            return type

    return 'generic'
}

export function dependenciesToPackages(cache: PackageCache, dependencies: Array<GitPair>): Array<Package> {
    return dependencies.map((git) => {
        const [namespace, name] = parseNamespaceAndName(git.repo)
        const type = parsePackageType(git.repo)
        const purl = new PackageURL(type, namespace, name, git.tag, null, null)

        return cache.package(purl)
    })
}

export function createBuildTarget(name: string, dependencies: Array<GitPair>): BuildTarget {
    const cache = new PackageCache()
    const packages = dependenciesToPackages(cache, dependencies)
    const buildTarget = new BuildTarget(name, core.getInput('sourcePath') + '/example/CMakeLists.txt')

    packages.forEach(p => {
        buildTarget.addBuildDependency(p)
    });

    return buildTarget
}

export async function main() {
    try {
        const sourcePath = core.getInput('sourcePath')
        const buildTargetName = core.getInput('buildTargetName')
        const cmakeFiles = globSync([sourcePath + '/**/CMakeLists.txt', sourcePath + '/**/*.cmake'])

        core.startGroup('Parsing CMake files...')
        core.info(`Scanning dependencies for ${ cmakeFiles.join(', ') }`)

        const dependencies = parseCMakeListsFiles(cmakeFiles)

        core.info(`Found dependencies: ${ JSON.stringify(dependencies) }`);
        core.endGroup()

        core.startGroup('Submitting dependencies...')
        const buildTarget = createBuildTarget(buildTargetName, dependencies)
        const snapshot = new Snapshot({
            name: 'cmake-dependency-submission',
            url: 'https://github.com/philips-forks/cmake-dependency-submission',
            version: '0.1.0' // x-release-please-version
        })

        snapshot.addManifest(buildTarget)
        submitSnapshot(snapshot)
        core.endGroup()
    }
    catch (err) {
        core.setFailed(`Action failed with ${err}`)
    }
}
