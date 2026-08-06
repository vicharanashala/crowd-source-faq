/**
 * Important Links — reusable UI components.
 *
 * Additive-only barrel: new components in this module should be exported
 * here rather than requiring changes to files outside this folder.
 */

export { default as ImportantLinksTab } from './ImportantLinksTab';
export type { ImportantLinksTabProps } from './ImportantLinksTab';

export { default as LinkCard } from './LinkCard';
export type { LinkCardProps } from './LinkCard';

export { default as ManageLinksModal } from './ManageLinksModal';
export type { ManageLinksModalProps } from './ManageLinksModal';

export { default as CategoryFilter } from './CategoryFilter';
export type { CategoryFilterProps, CategoryFilterValue } from './CategoryFilter';

export { default as CopyLinkButton } from './CopyLinkButton';
export type { CopyLinkButtonProps } from './CopyLinkButton';

export {
  IMPORTANT_LINK_CATEGORIES,
  type LinkCategory,
  type ImportantLink,
  type ImportantLinkDraft,
} from './types';
