import React, { useState } from "react";
import { Icon } from "../../ui/Icon";

export function PasswordField({ hint, id, label, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="nl-field" htmlFor={id}>
      <span className="nl-field__label">{label}</span>
      <span className="nl-field__control nl-field__control--action">
        <input id={id} type={visible ? "text" : "password"} {...props} />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className="nl-field__action"
          onClick={() => setVisible((value) => !value)}
          type="button"
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={17} />
        </button>
      </span>
      {hint && <span className="nl-field__hint">{hint}</span>}
    </label>
  );
}
