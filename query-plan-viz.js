var QueryPlanViz;
(function (QueryPlanViz) {
    var Details = (function () {
        function Details() {
        }
        return Details;
    }());
    var QueryNode = (function () {
        function QueryNode() {
        }
        return QueryNode;
    }());
    var Options = (function () {
        function Options() {
        }
        return Options;
    }());
    var Visualizer = (function () {
        /**
         * @param options Options for the chart
         */
        function Visualizer(options) {
            var _this = this;
            // Mapping of step names to colors. 
            this.colors = {
                "operation": "#5687d1",
                "data": "#7b615c",
                "join": "#de783b",
                "language": "#6ab975",
                "other": "#a173d1",
                "end": "#0c0909"
            };
            // fudge it so at least everything has can make an appearance. this is straight garbage honestly
            // but if we don't do it query plans where a join happens where it is 99.9% vs 1% the .1% just doesn't show
            // looks ok until you zoom in on the tiny items and then they don't "resize" to be relative to one another
            this.totalSize = 0;
            this.arc = d3.svg.arc()
                .startAngle(function (d) { return Math.max(0, Math.min(2 * Math.PI, _this.x(d.x))); })
                .endAngle(function (d) { return Math.max(0, Math.min(2 * Math.PI, _this.x(d.x + d.dx))); })
                .innerRadius(function (d) { return Math.max(0, _this.y(d.y)); })
                .outerRadius(function (d) { return Math.max(0, _this.y(d.y + d.dy)); });
            this.partition = d3.layout.partition()
                .value(function (d) { return Math.max(_this.totalSize / 360, d.size); });
            this.width = options.width != undefined ? options.width : 500;
            this.height = options.height != undefined ? options.height : 500;
            this.radius = (Math.min(this.width, this.height) / 2) - 10;
            this.x = d3.scale.linear()
                .range([0, 2 * Math.PI]);
            this.y = d3.scale.sqrt()
                .range([0, this.radius]);
            var chartSelector = options.chartSelector != undefined ? options.chartSelector : ".query-plan-visualization .chart";
            var tableSelector = options.tableSelector != undefined ? options.tableSelector : ".query-plan-visualization .table";
            this.vis = d3.select(chartSelector)
                .append("svg")
                .attr("width", this.width)
                .attr("height", this.height)
                .append("g")
                .attr("id", "container")
                .attr("transform", "translate(" + this.width / 2 + "," + this.height / 2 + ")");
            this.rect = this.vis.selectAll("rect");
            this.table = d3.select(tableSelector).append("table");
            this.tbody = this.table.append("tbody");
        }
        /**
         * Renders a chart using data from an xml file
         *
         * @param filePath
         */
        Visualizer.prototype.renderXml = function (filePath) {
            var _this = this;
            d3.xml(filePath, "application/xml", function (error, data) {
                if (error)
                    throw error;
                _this.renderData(data);
            });
        };
        Visualizer.prototype.renderData = function (data) {
            var _this = this;
            var queries = data.querySelectorAll("StmtSimple");
            var root = new QueryNode();
            root.name = "queries";
            root.children = new Array();
            root.details = [{ name: "test", value: "value" }];
            for (var _i = 0, queries_1 = queries; _i < queries_1.length; _i++) {
                var query = queries_1[_i];
                root.children.push(this.buildQuery(query));
            }
            this.totalSize = 0;
            this.addSizeToTotal(root);
            this.rect = this.rect
                .data(this.partition.nodes(root))
                .enter().append("path")
                .attr("display", function (d) {
                if (!d.depth)
                    return "none";
                return d.operationType === "end" ? "none" : null;
            })
                .attr("d", this.arc)
                .attr("fill", function (d) { return _this.colors[d.operationType]; })
                .on("click", function (d) { return _this.click(d); })
                .on("mouseover", function (d) { return _this.mouseover(d); });
            d3.select("#container").on("mouseleave", function (d) { return _this.mouseleave(d); });
        };
        Visualizer.prototype.buildQuery = function (q) {
            var queryPlan = q.querySelector(":scope > QueryPlan");
            var item = new QueryNode();
            item.name = q.attributes["StatementType"].value;
            item.size = q.attributes["StatementSubTreeCost"].value;
            item.operationType = "language";
            item.children = [];
            item.details = [
                { name: "StatementSubTreeCost", value: q.attributes["StatementSubTreeCost"].value },
                { name: "StatementEstRows", value: q.attributes["StatementEstRows"].value },
                { name: "DegreeOfParallelism", value: queryPlan.attributes["DegreeOfParallelism"].value },
                { name: "CachedPlanSize", value: queryPlan.attributes["CachedPlanSize"].value + " KB" }
            ];
            var childOps = q.querySelectorAll(":scope > * > RelOp");
            this.addRelOps(item, childOps);
            return item;
        };
        Visualizer.prototype.setDescription = function (item, node) {
            item.title = node.attributes["PhysicalOp"].value + " (" + node.attributes["LogicalOp"].value + ")";
            var objectNode = node.querySelector(":scope > * > Object");
            if (objectNode != undefined)
                item.description = this
                    .getNameFromAttributeList(objectNode, ["Schema", "Table", "Index", "Column", "Alias"]);
        };
        Visualizer.prototype.getNameFromAttributeList = function (node, attributeList) {
            var name = "";
            var first = true;
            for (var _i = 0, attributeList_1 = attributeList; _i < attributeList_1.length; _i++) {
                var attribute = attributeList_1[_i];
                if (attribute != undefined) {
                    if (first === false)
                        name += ".";
                    else
                        first = false;
                    name += attribute.value;
                }
            }
            return name;
        };
        Visualizer.prototype.addSizeToTotal = function (d) {
            if (d.size != undefined) {
                console.log(Number(d.size));
                this.totalSize += Number(d.size);
            }
            if (d.children == undefined)
                return;
            var i;
            for (i = 0; i < d.children.length; i++) {
                this.addSizeToTotal(d.children[i]);
            }
        };
        Visualizer.prototype.addRelOps = function (parent, relOps) {
            for (var _i = 0, relOps_1 = relOps; _i < relOps_1.length; _i++) {
                var op = relOps_1[_i];
                var item = new QueryNode();
                item.name = op.attributes["PhysicalOp"].value;
                item.operationType = this.getOperationType(op.attributes["LogicalOp"].value);
                item.details = [];
                item.children = [
                    { name: "EstimateCPU", size: Number(op.attributes["EstimateCPU"].value), operationType: "end" },
                    { name: "EstimateIO", size: Number(op.attributes["EstimateIO"].value), operationType: "end" }
                ];
                var j = void 0;
                for (j = 0; j < op.attributes.length; j++) {
                    item.details.push({ name: op.attributes[j].name, value: op.attributes[j].value });
                }
                this.setDescription(item, op);
                var children = op.querySelectorAll(":scope > * > RelOp");
                if (children.length > 0) {
                    this.addRelOps(item, children);
                }
                parent.children.push(item);
            }
        };
        Visualizer.prototype.getOperationType = function (logicalOp) {
            switch (logicalOp) {
                case "Clustered Index Scan":
                case "Clustered Index Seek":
                case "Index Seek":
                case "Index Scan":
                case "Table Scan":
                    return "data";
                case "Cross Join":
                case "Inner Join":
                case "Left Anti Semi Join":
                case "Left Outer Join":
                case "Left Semi Join":
                case "Right Anti Semi Join":
                case "Right Outer Join":
                case "Right Semi Join":
                case "Merge":
                    return "join";
                default:
                    return "operation";
            }
        };
        Visualizer.prototype.click = function (node) {
            var _this = this;
            console.log("click");
            this.vis
                .transition()
                .duration(750)
                .tween("scale", function () {
                var xd = d3.interpolate(_this.x.domain(), [node.x, node.x + node.dx]), yd = d3.interpolate(_this.y.domain(), [node.y, 1]), yr = d3.interpolate(_this.y.range(), [node.y ? 60 : 0, _this.radius]);
                return function (t) {
                    _this.x.domain(xd(t));
                    _this.y.domain(yd(t)).range(yr(t));
                };
            })
                .selectAll("path")
                .attrTween("d", function (d) { return function () { return _this.arc(d); }; });
        };
        Visualizer.prototype.mouseover = function (d) {
            // const parents = this.getAncestors(d);
            var children = this.getDescendents(d);
            // Fade all the segments.
            d3.selectAll("path")
                .style("opacity", 0.6)
                .style("border-color", "#fff");
            // Then highlight only those that are an ancestor of the current segment.
            this.vis.selectAll("path")
                .filter(function (node) { return (children.indexOf(node) >= 0); })
                .style("opacity", 1);
            this.vis.selectAll("path")
                .filter(function (node) { return (node === d); })
                .style("border-color", "#ccc");
            d3.selectAll(".query-plan-details-title").html(d.title != undefined ? d.title : "&nbsp;");
            d3.selectAll(".query-plan-details-description").html(d.description != undefined ? d.description : "&nbsp;");
            var details = d.details;
            if (details == undefined)
                details = d.parent.details;
            var row = this.tbody.selectAll("tr");
            row.remove();
            row.data(details)
                .enter()
                .append("tr");
            row.append("td").text(function (r) { return r.name; });
            row.append("td").text(function (r) { return r.value; });
        };
        // Restore everything to full opacity when moving off the visualization.
        Visualizer.prototype.mouseleave = function (d) {
            d3.selectAll("path")
                .style("opacity", 1);
        };
        // Given a node in a partition layout, return an array of all of its ancestor
        // nodes, highest first, but excluding the root.
        Visualizer.prototype.getAncestors = function (node) {
            var path = [];
            var current = node;
            while (current.parent) {
                path.unshift(current);
                current = current.parent;
            }
            return path;
        };
        Visualizer.prototype.getDescendents = function (node) {
            var path = [node];
            if (node.children == undefined)
                return path;
            for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                var child = _a[_i];
                path.push.apply(path, this.getDescendents(child));
            }
            return path;
        };
        return Visualizer;
    }());
    QueryPlanViz.Visualizer = Visualizer;
})(QueryPlanViz || (QueryPlanViz = {}));
//# sourceMappingURL=query-plan-viz.js.map