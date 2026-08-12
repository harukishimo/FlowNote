type Props = {
  className?: string;
  title?: string;
};

/** FlowNote mark: a memo sheet containing a branching activity flow. */
export function FlowNoteLogo({ className = '', title }: Props) {
  return <svg className={`flow-logo ${className}`.trim()} viewBox="0 0 96 96" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    {title && <title>{title}</title>}
    <rect width="96" height="96" rx="25" fill="#425c4a" />
    <path d="M25 17h34l13 13v47a6 6 0 0 1-6 6H25a6 6 0 0 1-6-6V23a6 6 0 0 1 6-6Z" fill="#f8f8f5" />
    <path d="M59 17v13h13" fill="#dfe7dc" />
    <path d="M59 17v13h13" fill="none" stroke="#a9b8a6" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="42" cy="35" r="5.5" fill="#425c4a" />
    <path d="M42 40.5v12m0 0-11 10m11-10 11 10" fill="none" stroke="#425c4a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="31" cy="65" r="5" fill="#8b6f42" />
    <circle cx="53" cy="65" r="5" fill="#425c4a" />
  </svg>;
}
