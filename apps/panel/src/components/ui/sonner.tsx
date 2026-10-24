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
      // Phones: at the top like a system notification, no close button (swipe to dismiss), at most two stacked.
      // Computer: bottom-right corner, out of the way of the page header.
      position={mobile ? "top-center" : "bottom-right"}
      closeButton={!mobile}
      visibleToasts={mobile ? 2 : 3}
      mobileOffset={{ top: "calc(0.5rem + env(safe-area-inset-top))", left: 12, right: 12 }}
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
