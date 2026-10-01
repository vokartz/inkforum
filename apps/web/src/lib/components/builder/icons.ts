import type { BuilderBlockType } from '@forum/shared';
import type { Component } from 'svelte';
import FlagBannerIcon from 'phosphor-svelte/lib/FlagBanner';
import TextAaIcon from 'phosphor-svelte/lib/TextAa';
import SquaresFourIcon from 'phosphor-svelte/lib/SquaresFour';
import MegaphoneIcon from 'phosphor-svelte/lib/Megaphone';
import QuestionIcon from 'phosphor-svelte/lib/Question';
import ImageIcon from 'phosphor-svelte/lib/Image';
import ImagesIcon from 'phosphor-svelte/lib/Images';
import YoutubeIcon from 'phosphor-svelte/lib/YoutubeLogo';
import GameIcon from 'phosphor-svelte/lib/GameController';
import ChartIcon from 'phosphor-svelte/lib/ChartLineUp';
import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
import ListIcon from 'phosphor-svelte/lib/ListBullets';
import UsersThreeIcon from 'phosphor-svelte/lib/UsersThree';
import TimerIcon from 'phosphor-svelte/lib/Timer';
import CodeIcon from 'phosphor-svelte/lib/Code';
import ArrowsVIcon from 'phosphor-svelte/lib/ArrowsVertical';
import NavIcon from 'phosphor-svelte/lib/NavigationArrow';
import RowsIcon from 'phosphor-svelte/lib/Rows';
import ColumnsIcon from 'phosphor-svelte/lib/Columns';
import QuotesIcon from 'phosphor-svelte/lib/Quotes';
import TagIcon from 'phosphor-svelte/lib/Tag';
import PathIcon from 'phosphor-svelte/lib/Path';
import ShareIcon from 'phosphor-svelte/lib/ShareNetwork';
import HandshakeIcon from 'phosphor-svelte/lib/Handshake';

type Icon = Component<any>;

/** Sayfa oluşturucu blok ikonları */
export const BLOCK_ICONS: Record<BuilderBlockType, Icon> = {
  navbar: NavIcon,
  footer: RowsIcon,
  split: ColumnsIcon,
  testimonials: QuotesIcon,
  pricing: TagIcon,
  timeline: PathIcon,
  social: ShareIcon,
  logos: HandshakeIcon,
  hero: FlagBannerIcon,
  text: TextAaIcon,
  features: SquaresFourIcon,
  cta: MegaphoneIcon,
  faq: QuestionIcon,
  image: ImageIcon,
  gallery: ImagesIcon,
  video: YoutubeIcon,
  server: GameIcon,
  stats: ChartIcon,
  latest: ChatsIcon,
  boards: ListIcon,
  team: UsersThreeIcon,
  countdown: TimerIcon,
  html: CodeIcon,
  spacer: ArrowsVIcon,
};

export const BLOCK_GROUPS = [
  { key: 'layout', label: 'Sayfa iskeleti' },
  { key: 'basic', label: 'Temel' },
  { key: 'media', label: 'Medya' },
  { key: 'dynamic', label: 'Canlı ve tanıtım' },
  { key: 'advanced', label: 'Gelişmiş' },
] as const;
