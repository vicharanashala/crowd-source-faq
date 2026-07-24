/**
 * Component-specific layout and color patterns.
 */

/* ── Common icon button patterns ─────────────────────────────── */
export const iconBtn         = 'inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:bg-mist hover:text-ink transition-colors';
export const iconBtnSm       = 'inline-flex items-center justify-center w-6 h-6 rounded text-ink-soft hover:bg-mist hover:text-ink transition-colors';
export const iconBtnAccent   = 'inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:text-accent hover:bg-accent-light transition-colors';
export const iconBtnPrimary  = 'inline-flex items-center justify-center w-8 h-8 rounded-full bg-mist text-ink-soft hover:bg-mist hover:text-ink transition-colors';
export const modalCloseButton    = 'w-7 h-7 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-black/5 transition-colors cursor-pointer';
export const notificationBellButton = 'hidden lg:flex w-9 h-9 items-center justify-center rounded-full hover:bg-black/5 transition-colors relative cursor-pointer';

/* ── Avatar patterns ──────────────────────────────────────────── */
export const avatarSm         = 'w-6 h-6 rounded-full object-cover';
export const avatarMd         = 'w-8 h-8 rounded-full object-cover';
export const avatarLg         = 'w-10 h-10 rounded-full object-cover';
export const avatarPlaceholder = 'w-8 h-8 rounded-full bg-mist flex items-center justify-center text-xs font-semibold text-ink-soft';

export const avatarColor1   = '#6b92e0';   /* sky blue */
export const avatarColor2   = '#5a9a6b';   /* sage green */
export const avatarColor3   = '#c4943a';   /* amber */
export const avatarColor4   = '#e07c6b';   /* coral */
export const avatarColor5   = '#7c6be0';   /* violet */
export const avatarColor6   = '#e06ba8';   /* pink */
export const avatarColorDefault = '#6b92e0';

export const avatarColorPalette: readonly string[] = [
  avatarColor1,
  avatarColor2,
  avatarColor3,
  avatarColor4,
  avatarColor5,
  avatarColor6,
];

/* ── Card / section patterns ────────────────────────────────── */
export const cardSection     = 'bg-card border border-border rounded-xl overflow-hidden';
export const cardSectionPad  = 'bg-card border border-border rounded-xl overflow-hidden p-5';
export const cardHeader      = 'px-4 py-3 border-b border-border';
export const cardBody        = 'px-4 py-3';
export const cardFooter      = 'px-4 py-3 border-t border-border';

export const accountCard        = 'bg-card rounded-2xl border border-border p-6';
export const accountCardStack   = 'bg-card rounded-2xl border border-border p-6 space-y-4';
export const accountCardHeader  = 'flex items-center justify-between';
export const accountSectionTitle = 'text-sm font-semibold text-ink uppercase tracking-wide';

export const accountActionLink    = 'text-xs font-semibold text-accent hover:text-accent-hover transition-colors';
export const accountActionLinkDisabled = 'text-xs font-semibold text-accent hover:text-accent-hover transition-colors disabled:opacity-50';
export const accountCancelLink    = 'text-xs font-semibold text-ink-faint hover:text-ink transition-colors';
export const accountLastUpdated   = 'text-sm text-ink-faint mt-2';

/* ── Table patterns ─────────────────────────────────────────── */
export const tableBase       = 'w-full';
export const tableTh         = 'px-3 py-2.5 text-left text-[10px] font-semibold text-ink-faint uppercase tracking-widest whitespace-nowrap';
export const tableTd         = 'px-3 py-3 text-sm text-ink';
export const tableTr         = 'border-b border-border/50 last:border-0 hover:bg-mist transition-colors';
export const tableTrLast     = 'hover:bg-mist transition-colors';

/* ── Search & Suggestion patterns ───────────────────────────── */
export const searchInputDefault = 'w-full pl-12 pr-32 py-5 sm:py-[22px] rounded-[26px] border border-border bg-card text-sm sm:text-base text-ink placeholder-ink-faint focus:outline-none focus:border-accent focus:bg-card transition-all duration-300 shadow-[0_14px_34px_rgba(31,41,51,0.07)]';
export const searchInputCompact = 'w-full bg-mist border border-border/60 text-ink text-sm rounded-[14px] pl-10 pr-3 py-1.5 outline-none focus:bg-card focus:border-accent/40 focus:ring-2 focus:ring-accent/10 transition-all placeholder-ink-faint';

export const searchSuggestionItem = 'w-full text-left px-5 py-3.5 text-sm text-ink hover:bg-cream/60 transition-colors duration-150 border-b border-border/30 last:border-0 flex items-center gap-3';

/* ── Search dropdown panel + items ──────────────────────────────
 * Replaces the .search-panel / .search-list-item / .search-skeleton
 * CSS classes that lived in index.css before the styles refactor.
 * The Tailwind strings here reproduce the same glassmorphism look
 * using theme tokens (bg-card, accent, border) so the panel re-skins
 * automatically with the rest of the site. */
export const searchPanel             = 'bg-card/85 backdrop-blur-[20px] border border-border rounded-2xl shadow-[0_20px_50px_rgb(var(--text-primary-rgb)/0.14)] bg-[linear-gradient(135deg,rgb(var(--accent-rgb)/0.06),rgb(var(--bg-card-rgb)/0.6))] dark:bg-card/60 dark:border-white/10 dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] dark:bg-[linear-gradient(135deg,rgb(var(--accent-rgb)/0.06),rgba(0,0,0,0.2))]';
export const searchPanelGlow         = 'shadow-[0_14px_34px_rgb(31,41,51,0.07)] focus-within:shadow-[0_0_0_4px_rgb(var(--accent-rgb)/0.18),0_14px_34px_rgb(31,41,51,0.10)] dark:shadow-[0_14px_34px_rgba(0,0,0,0.4)]';
export const searchPanelHeader       = 'flex items-center justify-between px-4 pt-4 pb-2';
export const searchPanelLoadingSkeleton = 'h-[72px] rounded-2xl bg-card/50 border border-border animate-pulse dark:bg-white/[0.04] dark:border-white/[0.06]';
export const searchPanelListEmpty    = 'rounded-2xl border border-dashed border-border bg-transparent p-4';
export const searchListItemDefault   = 'w-full text-left rounded-2xl border border-transparent bg-card hover:bg-card-hover hover:border-border/60 px-3 py-2 transition-colors text-ink';
export const searchListItemCompact   = 'w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-transparent text-left bg-card hover:bg-card-hover hover:border-border/60 transition-colors text-ink';
export const searchListItemQuestionRow = 'text-sm font-semibold text-ink line-clamp-2';
export const searchListItemResultBody = 'text-xs text-ink-soft line-clamp-3 mt-1 leading-relaxed';

export const exploreSearchBar   = 'w-full pl-12 pr-24 py-3.5 rounded-full border border-border/70 bg-card text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-card transition-all duration-200 shadow-subtle';
export const exploreSearchIcon  = 'absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none';
export const exploreSearchClear = 'absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint hover:text-ink px-2 py-1 rounded-full hover:bg-mist transition-colors';

export const suggestForm         = 'mt-3 bg-mist/60 border border-border/70 rounded-2xl p-4 space-y-3 animate-fade-in';
export const suggestLabel        = 'text-xs font-semibold text-ink';
export const suggestTextarea     = 'w-full text-xs p-3 rounded-xl border border-border bg-card focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y';
export const suggestError        = 'text-[11px] text-danger';
export const suggestSuccess      = 'text-[11px] text-success';

export const suggestBtnCancel    = 'px-3 py-1.5 rounded-full border border-border bg-card text-[11px] font-semibold text-ink-soft hover:bg-cream transition-colors';
export const suggestBtnSubmit    = 'px-4 py-1.5 rounded-full bg-accent text-accent-text text-[11px] font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50';

export const suggestCta         = 'inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-accent transition-colors';
export const suggestCtaAccent    = 'inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dark hover:underline transition-colors';
export const suggestCtaFaint     = 'inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink-soft transition-colors';

/* ── Result & Vote patterns ─────────────────────────────────── */
export const resultCardCollapsed = 'border border-border/70 bg-card/80 hover:bg-cream rounded-2xl transition-all duration-300 overflow-hidden';
export const resultCardExpanded  = 'border border-accent/30 bg-cream rounded-2xl transition-all duration-300 overflow-hidden';

export const resultMetaSource    = 'inline-flex items-center px-2.5 py-0.5 rounded-full bg-mist text-ink-soft font-semibold uppercase tracking-wider';
export const resultMetaCategory  = 'inline-flex items-center px-2.5 py-0.5 rounded-full bg-accent-light text-accent font-semibold uppercase tracking-wider';

export const resultBody          = 'mt-1.5 text-xs text-ink-soft leading-relaxed line-clamp-2';
export const resultTitle         = 'text-sm font-semibold text-ink leading-snug';

export const resultHeaderFaq     = 'rounded-xl bg-accent-light border border-accent/15 p-4';
export const resultHeaderCommunity = 'rounded-xl bg-success-light border border-success/15 p-4';

export const resultFaqLabel      = 'text-[11px] font-semibold text-accent mb-2 uppercase tracking-wide';
export const resultCommunityLabel = 'text-[11px] font-semibold text-success mb-2 uppercase tracking-wide';

export const resultBodyFaq       = 'text-sm text-ink/75 leading-relaxed whitespace-pre-wrap';
export const resultBodyFaqShort  = 'text-sm text-ink/75 leading-relaxed';
export const resultBodyCommunity = 'text-sm text-ink/70 leading-relaxed';

export const votePillBase       = 'inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border transition-all duration-200 disabled:cursor-default';
export const voteUp             = 'border-accent/40 bg-accent-light text-accent';
export const voteDown           = 'border-danger/40 bg-danger-light text-danger';
export const voteUpIdle         = 'border-border text-ink-faint hover:border-accent/40 hover:text-accent';
export const voteDownIdle       = 'border-border text-ink-faint hover:border-danger/40 hover:text-danger';

export const votePillSingle      = 'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all';
export const votePillAccent      = 'border-accent/40 bg-accent/10 text-accent';
export const votePillAccentIdle  = 'border-border text-ink-soft hover:border-accent/30 hover:text-accent';
export const votePillDanger      = 'border-danger/40 bg-danger-light text-danger';
export const votePillDangerIdle  = 'border-border text-ink-soft hover:border-danger/30 hover:text-danger';

export const tierPillBase        = 'flex-1 py-2 px-3 rounded-xl border text-xs font-medium transition-all';
export const tierPillAccent      = 'border-accent/40 bg-accent/10 text-accent';
export const tierPillDanger      = 'border-danger/40 bg-danger-light text-danger';
export const tierPillIdle        = 'border-border text-ink-soft hover:bg-mist';

export const confidencePill       = 'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold';
export const confidenceHigh       = 'bg-success-light text-success';
export const confidenceMedium     = 'bg-warning-light text-warning';
export const confidenceLow        = 'bg-mist text-ink-faint';

export const zoomBrandBlue       = '#2D8CFF';                   /* Zoom brand — fixed colour */

/* ── Topbar patterns ────────────────────────────────────────── */
export const topbarPill         = 'inline-flex items-center gap-2 h-9 px-3 rounded-full bg-card border border-border/70 text-xs text-ink font-medium hover:border-accent/60 transition-colors shadow-sm';
export const topbarPillCompact  = 'inline-flex items-center gap-2 px-2.5 py-1 text-[11px] rounded-full bg-card border border-border/70 text-xs text-ink font-medium hover:border-accent/60 transition-colors shadow-sm';
export const topbarPillIdle     = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/70 text-xs text-ink-soft';
export const topbarPillLoading  = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/70 text-xs text-ink-soft';
export const topbarPillDot      = 'w-3 h-3 rounded-full bg-mist animate-pulse';

export const topbarDropdown     = 'absolute right-0 top-full mt-2 z-40 w-72 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-float overflow-hidden animate-fade-in';
export const topbarDropdownHeader = 'px-4 py-3 border-b border-border/60';
export const topbarDropdownFooter = 'border-t border-border/60 p-1.5';

export const topbarDropdownItem       = 'w-full text-left px-4 py-2.5 hover:bg-mist transition-colors flex items-start gap-3';
export const topbarDropdownItemSelected = 'w-full text-left px-4 py-2.5 hover:bg-mist transition-colors flex items-start gap-3 bg-mist/60';
export const topbarDropdownItemIcon       = 'shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-mist text-ink-soft group-hover:text-accent';
export const topbarDropdownItemIconAccent = 'shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-accent text-accent-text';

export const topbarCreateButton   = 'w-full text-left px-3 py-2 rounded-xl hover:bg-mist text-xs font-medium text-accent flex items-center gap-2';
export const topbarFooter         = 'w-full border-t border-border bg-bg/50 backdrop-blur-[10px] mt-16';

export const topbarUserAvatar     = 'w-9 h-9 rounded-full object-cover ring-2 ring-card transition-transform duration-200 group-hover:scale-105';
export const topbarUserAvatarInit = 'w-9 h-9 rounded-full flex items-center justify-center text-accent-text text-sm font-semibold ring-2 ring-card transition-transform duration-200 group-hover:scale-105';

export const accentChip         = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold shadow-sm';
export const accentChipCompact  = 'inline-flex items-center gap-2 text-[11px] font-medium text-ink-faint bg-card/70 border border-border/60 rounded-full px-3 py-1';
export const accentDot          = 'w-1.5 h-1.5 rounded-full bg-accent';
export const accentTextMuted    = 'text-accent/70 font-medium';

/* ── Admin chart & community patterns ───────────────────────── */
export const adminChartStroke      = 'rgb(var(--accent-rgb))';                 /* line/area/bar stroke */
export const adminChartFill        = 'rgb(var(--accent-rgb) / 0.35)';          /* area gradient stop */
export const adminChartFillFade    = 'rgb(var(--accent-rgb) / 0)';             /* area gradient fade */
export const adminChartGrid        = 'rgb(var(--text-primary-rgb) / 0.04)';    /* gridline */
export const adminChartAxis        = 'rgb(var(--text-primary-rgb) / 0.25)';    /* axis tick text */
export const adminChartTooltipBg   = 'rgb(var(--bg-card-rgb) / 0.97)';         /* tooltip background */
export const adminChartTooltipBord = 'rgb(var(--accent-rgb) / 0.30)';          /* tooltip border */
export const adminChartTooltipText = 'rgb(var(--accent-rgb))';                 /* tooltip value text */
export const adminChartCursor      = 'rgb(var(--accent-rgb) / 0.30)';          /* chart cursor (hover line) */
export const adminChartBg          = 'rgb(var(--text-primary-rgb) / 0.05)';    /* radial background */
export const adminChartActiveDotFill   = 'rgb(var(--accent-rgb))';
export const adminChartActiveDotStroke = 'rgb(var(--bg-primary-rgb))';
export const adminChartProgressFill = 'rgb(var(--accent-rgb))';                /* radial bar fill */
export const adminLegendApprovedDot = 'rgb(var(--success-rgb))';                /* approved legend dot */
export const adminLegendPendingDot  = 'rgb(var(--warning-rgb))';                /* pending legend dot */
export const adminLegendRejectedDot = 'rgb(var(--danger-rgb))';                 /* rejected legend dot */
export const adminChartPercentText = 'rgb(var(--text-primary-rgb))';            /* big % number */
export const adminChartSubtleText  = 'rgb(var(--text-primary-rgb) / 0.30)';    /* "resolved" label */

export const communityUpvoteActive     = 'text-accent';
export const communityUpvoteIdle       = 'text-ink-faint hover:text-accent';
export const communityUpvotePillActive = 'text-accent bg-accent/10';
export const communityUpvotePillIdle   = 'text-ink-faint hover:text-accent hover:bg-accent/10';
export const communityDownvotePillActive = 'text-accent bg-accent/10';
export const communityDownvotePillIdle   = 'text-ink-faint hover:text-accent hover:bg-accent/10';

export const communityThreadDepth      = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-accent/30 text-accent bg-accent/10 text-[10px] font-medium';

export const communityActivityNew       = 'text-accent bg-accent/10';                       /* activity log — accent for new content (warm theme) */
export const communityActivityRemoved   = 'text-danger bg-danger/10';
export const communityActivityAnswer    = 'text-warning bg-warning/10';

export const communityReportButton      = 'w-8 h-8 rounded-xl bg-mist text-ink-soft hover:bg-danger/10 hover:text-danger flex items-center justify-center transition-all';
export const communityReportHover        = 'flex items-center gap-1 text-xs text-ink-faint hover:text-danger px-2 py-1.5 rounded-full hover:bg-danger/10 transition-all';
export const communityDangerText        = 'text-[11px] text-danger hover:text-danger transition-colors';
export const communityDangerTextHover   = 'ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs text-danger/70 hover:text-danger transition-colors';

export const communityCloseButton       = 'relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 transition-colors';
export const communityHoverRing         = 'absolute inset-0 rounded-full pointer-events-none';

export const communityTemplateCard      = 'w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-card/70 hover:bg-card border border-warning/30 hover:border-warning/50 hover:shadow-sm transition-all group cursor-pointer';
export const communityTemplateLabel     = 'text-[10px] font-semibold uppercase tracking-wide text-warning';
export const communityTemplateIcon       = 'shrink-0 mt-1 w-3 h-3 text-ink-faint group-hover:text-warning group-hover:translate-x-0.5 transition-all';

export const warningDot          = 'w-1.5 h-1.5 rounded-full bg-warning';

/* ── Freshness review badges / selectors ──────────────────────── */
export const badgePendingReview    = 'inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning-light px-1.5 py-0.5 rounded';
export const badgeUpdateRequested  = 'inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning-light px-1.5 py-0.5 rounded';
export const badgeVerified         = 'inline-flex items-center gap-1 text-xs text-accent';
export const badgeVerifiedBold     = 'inline-flex items-center gap-1 text-xs text-accent font-medium';
export const badgeVerifiedWarn     = 'inline-flex items-center gap-1 text-xs text-warning font-medium';
export const badgeCompact          = 'text-[10px]';

export const submitBtnDanger     = 'flex-1 py-1.5 text-xs rounded-lg bg-danger text-accent-text hover:bg-danger/85 transition-colors disabled:opacity-50';
export const submitBtnGhost      = 'flex-1 py-1.5 text-xs rounded-lg border border-border text-ink-soft hover:bg-mist transition-colors';

/* ── Modal / auth-modal / dialog shell ───────────────────────── */
export const modalShell          = 'fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fade-in';
export const modalTitleRow       = 'flex items-start justify-between mb-5';
export const modalTitle          = 'text-sm font-bold text-ink';
export const cardHeaderTitle     = 'text-base font-serif text-ink';

export const authModalPanel      = 'w-full max-w-sm bg-card rounded-2xl border border-border shadow-card p-6 animate-fade-in';
export const authCloseButton     = 'w-7 h-7 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-mist transition-colors -mt-1 -mr-1';
export const authTabRow          = 'flex items-center gap-1 p-1 rounded-full bg-mist mb-5';
export const authTabBase         = 'flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors';
export const authTabActive       = 'bg-card text-ink shadow-subtle';
export const authTabIdle         = 'text-ink-soft hover:text-ink';
export const authInputIcon       = 'pointer-events-auto p-1 hover:text-ink transition-colors flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/25';
export const authInfoBox         = 'mt-3 rounded-xl border border-border bg-mist px-3 py-2.5 text-center text-[11px] text-ink-soft';
export const authTitle           = 'text-base font-serif text-ink';
export const authHintSoft        = 'text-[11px] text-ink-soft mt-1';
export const authHintFaint       = 'text-[10px] text-ink-faint -mt-2';

export const dialogShell           = 'm-auto rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm';
export const dialogBody            = 'p-6 space-y-4 min-w-72';
export const dialogTitleSm         = 'text-sm font-semibold text-ink';
export const dialogLabel           = 'text-xs text-ink-soft';
export const dialogLabelFaint      = 'block mt-1 text-ink-faint';

/* ── Flag-outdated (warning-action) button + modal ───────────── */
export const flagButtonIdle        = 'text-xs px-2 py-1 rounded border transition-colors border-border text-ink-soft hover:border-warning/40 hover:text-warning';
export const flagButtonDisabled    = 'text-xs px-2 py-1 rounded border transition-colors border-border text-ink-faint cursor-not-allowed';

export const flagSubmitButton       = 'px-4 py-2 text-xs rounded-xl bg-warning text-accent-text hover:bg-warning/85 transition-colors disabled:opacity-50';
export const flagCancelButton      = 'px-4 py-2 text-xs rounded-xl border border-border text-ink-soft hover:bg-mist transition-colors';
export const flagErrorBanner        = 'text-xs text-danger bg-danger-light rounded-lg px-3 py-2';

/* ── Mobile hamburger/navbar chrome ──────────────────────────── */
export const navHamburger         = 'lg:hidden flex w-9 h-9 items-center justify-center rounded-[10px] hover:bg-black/5 transition-colors';
export const navMobileLinkActive  = 'bg-accent/10 text-accent';
export const navMobileLinkIdle    = 'text-ink-soft hover:text-ink hover:bg-black/[0.03]';
export const navMobileLinkBase    = 'block px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200';
export const navSecondaryLinkBase = 'block px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200';

/* ── Glass / floating-panel patterns ────────────────────────────
 * Used by the top floating header pill (resting + scrolled state),
 * the profile dropdown panel, and the mobile sheet. All four share
 * the same blur/border/shadow skeleton, varying only the background
 * alpha and shadow strength. Centralised here so the glassmorphism
 * language stays consistent and any future re-skin is a single
 * edit. */
export const navbarGlassResting  = 'bg-[rgb(var(--bg-card-rgb)_/_0.4)] backdrop-blur-[12px] border border-[rgb(var(--border-rgb)_/_0.2)] shadow-[0_4px_20px_rgba(0,0,0,0.03)]';
export const navbarGlass         = 'bg-[rgb(var(--bg-card-rgb)_/_0.75)] backdrop-blur-[24px] saturate-[1.5] border border-[rgb(var(--border-rgb)_/_0.5)] shadow-[0_8px_30px_rgba(0,0,0,0.08)]';
export const glassPanelStrong    = 'bg-[rgb(var(--bg-card-rgb)_/_0.85)] backdrop-blur-[24px] border border-[rgb(var(--border-rgb)_/_0.5)] shadow-[0_8px_30px_rgba(0,0,0,0.12)]';
export const mobileSheetPanel    = 'bg-[rgb(var(--bg-card-rgb)_/_0.95)] backdrop-blur-[20px] border border-[rgb(var(--border-rgb)_/_0.5)] shadow-[0_8px_30px_rgba(0,0,0,0.12)]';

/* Hover/separator row inside floating dropdowns. The previous
 * hand-rolled 'border-[rgb(var(--border-rgb)_/_0.3)]' string was
 * missing a closing ')' and emitted no CSS — extracted here to
 * fix the bug and lock in the intended 0.3 alpha. */
export const dropdownRowDivider  = 'border-[rgb(var(--border-rgb)_/_0.3)]';

/* Three-button theme picker (light/dark/system) shown inside the
 * profile dropdown. The base, idle, and active states are identical
 * across all three buttons, so they're extracted here. */
export const themePickerButtonBase = 'flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium rounded-md transition-colors';
export const themePickerActive     = 'bg-card text-ink shadow-sm';
export const themePickerIdle       = 'text-ink-soft hover:text-ink';

/* Shared hover background for floating-glass dropdown items. */
export const dropdownRowHover      = 'hover:bg-[rgb(var(--bg-card-rgb)_/_0.5)] hover:text-ink';

/* ── Navbar / pill patterns ─────────────────────────────────── */
export const navPill         = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium text-ink-soft transition-colors hover:text-ink hover:bg-mist';
export const navPillActive   = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold text-white bg-ink transition-colors';
export const navPillActiveAccent = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold text-accent-text bg-accent transition-colors';

/* ── Card hover lift effect ───────────────────────────────────── */
export const cardHover            = 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-border-medium';

/* ── Admin structures & layouts ────────────────────────────────── */
export const adminTableWrap       = 'bg-card border border-border rounded-xl overflow-hidden';
export const adminTheadRow        = 'bg-mist border-b border-border';
export const adminCardSurface     = 'bg-card border border-border rounded-xl overflow-hidden';
export const adminCardHeader      = 'px-4 py-3 border-b border-border';

export const adminTabBar          = 'flex rounded-lg border border-border overflow-hidden text-xs font-medium shrink-0';
export const adminTab             = 'px-4 py-2 transition-colors text-ink-soft hover:bg-mist';
export const adminTabActive       = 'bg-accent text-accent-text';

/* ── Welcome Package / Spatial glassmorphism ───────────────────── */
export const spatialGlass         = 'bg-card/15 backdrop-blur-[40px] border border-border/15 shadow-[inset_0_1px_0_rgba(var(--bg-card-rgb),0.2),0_20px_40px_rgba(var(--text-primary-rgb),0.1)]';
export const spatialGlassSubtle   = 'bg-card/5 backdrop-blur-[20px] border border-border/10 shadow-[inset_0_1px_0_rgba(var(--bg-card-rgb),0.1),0_10px_30px_rgba(var(--text-primary-rgb),0.05)]';
export const spatialNavPill       = 'bg-card/40 backdrop-blur-[40px] border border-border/10 shadow-[inset_0_1px_0_rgba(var(--bg-card-rgb),0.1),0_10px_30px_rgba(var(--text-primary-rgb),0.1)]';
export const spatialChatAi        = 'bg-gradient-to-br from-accent/15 to-card/40 backdrop-blur-[30px] border border-accent/30 shadow-[0_10px_25px_rgba(var(--text-primary-rgb),0.1),inset_0_1px_0_rgba(var(--bg-card-rgb),0.1)]';
export const spatialChatUser      = 'bg-gradient-to-br from-card/12 to-card/2 backdrop-blur-[30px] border border-border/15 shadow-[0_10px_25px_rgba(var(--text-primary-rgb),0.1),inset_0_1px_0_rgba(var(--bg-card-rgb),0.1)]';


