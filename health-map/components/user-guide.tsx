'use client';
import { useRef, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { Language } from '@/lib/model';
import { guideCopy } from '@/lib/user-guide';

function Steps({ steps }: { steps: string[] }) {
  return <ol className="guide-steps">{steps.map(step => <li key={step}>{step}</li>)}</ol>;
}
export function UserGuide({ language, hidden, onClose, onSwitchLanguage, onReturnFocus }: {
  language: Language; hidden: boolean; onClose: (hidden: boolean) => void; onSwitchLanguage: () => void; onReturnFocus: () => void;
}) {
  const [dontShow, setDontShow] = useState(hidden);
  const title = useRef<HTMLHeadingElement>(null);
  const t = guideCopy[language];
  return <Dialog open onOpenChange={open => { if (!open) onClose(dontShow); }}>
    <DialogContent className="usage-guide-dialog" showCloseButton={false}
      onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}>
      <header className="guide-header">
        <div><DialogTitle ref={title} tabIndex={-1}>{t.title}</DialogTitle><DialogDescription>{t.intro}</DialogDescription></div>
        <Button type="button" variant="outline" size="sm" onClick={onSwitchLanguage} aria-label={language === 'zh' ? 'Switch to English' : '切换为中文'}><Globe2 size={16} />{language === 'zh' ? 'EN' : '中文'}</Button>
      </header>
      <div className="guide-body" role="region" aria-label={t.contents} tabIndex={0}>
        {t.sections.map(section => <section className="guide-section" key={section.title}>
          <h3>{section.title}</h3>
          {section.steps && <Steps steps={section.steps} />}
          {section.groups?.map(group => <div className="guide-group" key={group.title}><h4>{group.title}</h4><Steps steps={group.steps} /></div>)}
          {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </section>)}
      </div>
      <footer className="guide-footer">
        <label className="guide-preference"><Checkbox checked={dontShow} onCheckedChange={checked => setDontShow(checked === true)} /><span>{t.dontShow}</span></label>
        <Button type="button" onClick={() => onClose(dontShow)}>{t.close}</Button>
      </footer>
    </DialogContent>
  </Dialog>;
}
