import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { ChevronRight, Menu, UserCircle2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SiteUser } from "@/lib/auth";

export interface MobileNavLink {
  label: string;
  href: string;
}

interface MobileNavProps {
  links: MobileNavLink[];
  siteUser: SiteUser | null;
  hasPaidAccess: boolean;
  onOpenDesk: () => void;
  onRestoreAccess: () => void;
}

/**
 * Below `lg` the desk header collapsed to just the logo and the "Open desk" CTA —
 * the section links, "Log in", "Account", and "Restore" were all hidden behind
 * `sm:`/`lg:`/`xl:` breakpoints with nothing standing in for them. On a phone there
 * was no way to sign in or reach a profile at all. This is that missing surface.
 *
 * Built on Radix Dialog for the focus trap, Escape handling, and scroll lock.
 */
export default function MobileNav({
  links,
  siteUser,
  hasPaidAccess,
  onOpenDesk,
  onRestoreAccess,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9ff55]/70 lg:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-x-0 top-0 z-50 max-h-[100dvh] overflow-y-auto border-b border-white/10 bg-[#05070d] px-4 pb-6 pt-4 shadow-[0_30px_100px_rgba(0,0,0,0.6)] duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:animate-in data-[state=open]:slide-in-from-top sm:px-6 lg:hidden">
          <DialogPrimitive.Title className="sr-only">Site navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Jump to a section, manage your account, or open the desk.
          </DialogPrimitive.Description>

          <div className="flex items-center justify-between gap-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Menu</div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9ff55]/70"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <nav aria-label="Primary" className="mt-4 grid gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9ff55]/70"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
            <Button
              asChild
              variant="ghost"
              className="justify-start text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
              onClick={close}
            >
              {siteUser ? (
                <Link to="/profile">
                  <UserCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Account
                </Link>
              ) : (
                <Link to="/login">
                  <UserCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Log in
                </Link>
              )}
            </Button>

            <Button
              variant="ghost"
              className="justify-start text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
              onClick={() => {
                close();
                onRestoreAccess();
              }}
            >
              <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
              Restore access
            </Button>

            {hasPaidAccess ? (
              <Button asChild className="mt-1 bg-[#b9ff55] font-semibold text-[#0b1007] hover:bg-[#d0ff8e]" onClick={close}>
                <Link to="/daily-picks">
                  Open desk
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <Button
                className="mt-1 bg-[#b9ff55] font-semibold text-[#0b1007] hover:bg-[#d0ff8e]"
                onClick={() => {
                  close();
                  onOpenDesk();
                }}
              >
                Open desk
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
