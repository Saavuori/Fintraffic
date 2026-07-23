import React, { useEffect, useState } from 'react';

interface VersionResponse {
  version: string;
  build_date: string;
  git_sha: string;
}

export const VersionBadge: React.FC = () => {
  const [info, setInfo] = useState<VersionResponse | null>(null);

  useEffect(() => {
    fetch('/api/version')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json() as Promise<VersionResponse>;
      })
      .then(setInfo)
      .catch((err) => console.error('Failed to load version:', err));
  }, []);

  if (!info) return null;

  const buildDate = info.build_date && info.build_date !== 'unknown'
    ? new Date(info.build_date).toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;

  return (
    <a
      className="version-badge"
      href="https://saavuori.github.io/Fintraffic/"
      target="_blank"
      rel="noopener noreferrer"
      title="View changelog"
    >
      <span className="version-badge__tag">{info.version}</span>
      <span className="version-badge__sep">·</span>
      <span className="version-badge__sha">{info.git_sha.substring(0, 7)}</span>
      {buildDate && (
        <>
          <span className="version-badge__sep">·</span>
          <span className="version-badge__date">{buildDate}</span>
        </>
      )}
    </a>
  );
};
