import cx from "classnames";
import { Button, Checkbox, Input } from "antd";
import { ClearOutlined } from "@ant-design/icons";
import {
  ALL_METHOD_CATEGORIES,
  MethodCategoryChip,
  RpcRequestFilter,
  selectMethodCategory,
} from "../table/rpcRequestFilter.ts";

const CHIPS: readonly MethodCategoryChip[] = ["All", ...ALL_METHOD_CATEGORIES];

interface RequestToolbarProps {
  filter: RpcRequestFilter;
  onFilterChange: (filter: RpcRequestFilter) => void;
  onClear: () => void;
}

// Modelled on the filter bar of the DevTools Network tab
export const RequestToolbar = ({
  filter,
  onFilterChange,
  onClear,
}: RequestToolbarProps) => {
  const isPressed = (chip: MethodCategoryChip) =>
    chip === "All"
      ? filter.categories.length === 0
      : filter.categories.includes(chip);

  return (
    <div className="rpc-table-toolbar">
      <Button
        size="small"
        type="text"
        title="Clear"
        icon={<ClearOutlined />}
        onClick={onClear}
      />
      <Input
        size="small"
        allowClear
        className="rpc-table-search"
        placeholder="Filter"
        aria-label="Filter"
        value={filter.search}
        onChange={(event) =>
          onFilterChange({ ...filter, search: event.target.value })
        }
      />
      <div
        className="rpc-table-chips"
        role="group"
        aria-label="Method Category"
      >
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className={cx("rpc-table-chip", {
              "rpc-table-chip-pressed": isPressed(chip),
            })}
            aria-pressed={isPressed(chip)}
            title={chip === "All" ? undefined : "Ctrl/⌘+click to add or remove"}
            onClick={(event) =>
              onFilterChange({
                ...filter,
                categories: selectMethodCategory(
                  filter.categories,
                  chip,
                  event.ctrlKey || event.metaKey,
                ),
              })
            }
          >
            {chip}
          </button>
        ))}
      </div>
      <Checkbox
        className="rpc-table-errors"
        checked={filter.errorsOnly}
        onChange={(event) =>
          onFilterChange({ ...filter, errorsOnly: event.target.checked })
        }
      >
        Errors
      </Checkbox>
    </div>
  );
};
