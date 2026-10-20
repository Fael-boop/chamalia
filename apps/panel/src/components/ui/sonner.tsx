"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTheme } from "@/lib/theme"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme()
  const mobile = useIsMobile()

  return (
    <Sonner
      theme={resolved}
      // Phones: above the bottom menu, no close button (swipe to dismiss), at most two stacked.
      position={mobile ? "bottom-center" : "top-center"}
      closeButton={!mobile}
      visibleToasts={mobile ? 2 : 3}
      mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))", left: 12, right: 12 }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
