export interface RegistryItemIdentity {
  kind: 'component' | 'hook' | 'showcase' | 'example' | 'block' | 'page';
  name: string;
  path: string;
  aliases: string[];
}

export const SHADCN_REGISTRY_ORIGIN: string;
export const SHADCN_REGISTRY_IS_PREVIEW: boolean;
export function resolveShadcnRegistryOrigin(
  env?: Record<string, string | undefined>,
): string;
export function slugifyRegistryName(value: string): string;
export function componentRegistryIdentity(
  packageName: string,
  componentName: string,
  isHook?: boolean,
  registry?: {slug?: string; aliases?: string[]} | null,
): RegistryItemIdentity;
export function blockRegistryIdentity(
  blockName: string,
  exampleFor?: string | null,
  isShowcase: boolean,
  registry?: {slug?: string; aliases?: string[]} | null,
): RegistryItemIdentity;
export function pageRegistryIdentity(
  templateSlug: string,
  registry?: {slug?: string; aliases?: string[]} | null,
): RegistryItemIdentity;
export function shadcnComponentItemName(
  packageName: string,
  componentName: string,
  isHook?: boolean,
  registry?: {slug?: string; aliases?: string[]} | null,
): string;
export function shadcnComponentItemPath(
  packageName: string,
  componentName: string,
  isHook?: boolean,
  registry?: {slug?: string; aliases?: string[]} | null,
): string;
export function shadcnBlockItemName(
  blockName: string,
  exampleFor?: string | null,
  isShowcase: boolean,
  registry?: {slug?: string; aliases?: string[]} | null,
): string;
export function shadcnBlockItemPath(
  blockName: string,
  exampleFor?: string | null,
  isShowcase: boolean,
  registry?: {slug?: string; aliases?: string[]} | null,
): string;
export function shadcnPageItemName(
  templateSlug: string,
  registry?: {slug?: string; aliases?: string[]} | null,
): string;
export function shadcnPageItemPath(
  templateSlug: string,
  registry?: {slug?: string; aliases?: string[]} | null,
): string;
export function shadcnInstallCommand(
  itemPath: string,
  registryOrigin?: string,
): string;
export function registryNameForPath(registryPath: string): string;
