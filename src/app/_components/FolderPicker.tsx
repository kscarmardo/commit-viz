"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, FolderGit2, ChevronRight, ChevronLeft, Home, X, Check, Loader2 } from "lucide-react";
import { api } from "~/trpc/react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
};

function Breadcrumbs({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (p: string) => void;
}) {
  const parts = path.replace(/\/$/, "").split("/").filter(Boolean);
  // Build segment paths: ['', 'Users', 'kyle', 'code'] → [/, /Users, /Users/kyle, ...]
  const segments = parts.map((part, i) => ({
    label: part,
    path: "/" + parts.slice(0, i + 1).join("/"),
  }));

  return (
    <div className="flex items-center gap-1 text-xs overflow-x-auto scrollbar-none flex-nowrap">
      {/* Root */}
      <button
        onClick={() => onNavigate("/")}
        className="text-white/40 hover:text-white/80 transition-colors flex-shrink-0 p-1 rounded hover:bg-white/5"
      >
        <Home className="w-3.5 h-3.5" />
      </button>
      {segments.map((seg, i) => (
        <div key={seg.path} className="flex items-center gap-1 flex-shrink-0">
          <ChevronRight className="w-3 h-3 text-white/20" />
          <button
            onClick={() => onNavigate(seg.path)}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              i === segments.length - 1
                ? "text-white/80 font-medium"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            {seg.label}
          </button>
        </div>
      ))}
    </div>
  );
}

export function FolderPicker({ isOpen, onClose, onSelect, initialPath }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath ?? "~");
  const listRef = useRef<HTMLDivElement>(null);

  // Reset to home when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath ?? "~");
    }
  }, [isOpen, initialPath]);

  const { data, isFetching, error } = api.dir.list.useQuery(
    { path: currentPath },
    { enabled: isOpen, staleTime: 30_000 }
  );

  const navigate = (path: string) => {
    setCurrentPath(path);
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4"
          >
            <div
              className="w-full max-w-lg pointer-events-auto rounded-2xl shadow-2xl overflow-hidden"
              style={{
                background: "rgba(15, 15, 25, 0.95)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-indigo-400" />
                  <span className="text-white font-semibold text-sm">Choose Repository</span>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Breadcrumbs */}
              <div className="px-4 py-2.5 border-b border-white/[0.05] flex items-center gap-2">
                {data?.parent && (
                  <button
                    onClick={() => navigate(data.parent!)}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-all flex-shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <Breadcrumbs
                  path={data?.path ?? currentPath}
                  onNavigate={navigate}
                />
                {isFetching && (
                  <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin flex-shrink-0 ml-auto" />
                )}
              </div>

              {/* "Use this folder" if current is a git repo */}
              {data?.isGitRepo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mx-3 mt-3"
                >
                  <button
                    onClick={() => {
                      onSelect(data.path);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/20 transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <FolderGit2 className="w-4 h-4 text-indigo-400" />
                      <div className="text-left">
                        <div className="text-white text-sm font-medium leading-snug">
                          {data.name}
                        </div>
                        <div className="text-indigo-400/70 text-xs">
                          Use this repository ↵
                        </div>
                      </div>
                    </div>
                    <Check className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </motion.div>
              )}

              {/* Directory list */}
              <div
                ref={listRef}
                className="overflow-y-auto"
                style={{ maxHeight: "340px" }}
              >
                {error ? (
                  <div className="px-4 py-8 text-center text-white/30 text-sm">
                    Cannot read this directory
                  </div>
                ) : !data || isFetching && !data ? (
                  <div className="px-4 py-8 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
                  </div>
                ) : data.entries.length === 0 ? (
                  <div className="px-4 py-8 text-center text-white/25 text-sm">
                    No subdirectories found
                  </div>
                ) : (
                  <div className="p-2">
                    {data.entries.map((entry) => (
                      <button
                        key={entry.path}
                        onClick={() => {
                          if (entry.isGitRepo) {
                            onSelect(entry.path);
                            onClose();
                          } else {
                            navigate(entry.path);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group text-left"
                      >
                        {entry.isGitRepo ? (
                          <FolderGit2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-white/30 flex-shrink-0 group-hover:text-white/50 transition-colors" />
                        )}
                        <span
                          className={`text-sm flex-1 truncate ${
                            entry.isGitRepo
                              ? "text-white/85 font-medium"
                              : "text-white/50 group-hover:text-white/75 transition-colors"
                          }`}
                        >
                          {entry.name}
                        </span>
                        {entry.isGitRepo ? (
                          <span className="text-[10px] text-indigo-400/70 font-medium bg-indigo-500/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
                            git
                          </span>
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-white/[0.05] flex items-center justify-between">
                <span className="text-white/25 text-xs">
                  <span className="text-indigo-400/70">git</span> repos highlighted
                </span>
                <button
                  onClick={onClose}
                  className="text-white/35 hover:text-white/60 text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
