import enum
import os, sys, re, shutil
from pyquery import PyQuery
from pathlib import Path


def clean_content(content_array):
    return [line.replace("\n","").strip() for line in content_array]

def get_js_var(content,varname):
    data = []
    start_index = -1
    end_index = -1
    counted_brackets = 0
    for index, line in enumerate(content):
        if line.find("var "+varname+" =") > -1:
            # print("found var " + varname + " at " +str(index))
            start_index = index+1
        if start_index > -1:
            counted_brackets += line.count("[")
            counted_brackets -= line.count("]")
            if index > start_index and counted_brackets == 0:
                end_index = index
                break
    if start_index > -1 and end_index > -1:
        data = content[start_index:end_index]

    return data



def parse_js_var(source_path,fname,var_name,level_offset):
    content = []
    with open(source_path+"/"+fname+".js") as data:
            content = clean_content(data.readlines())

    navtree_content = get_js_var(content,var_name)
    nav_content = []
    current_level = level_offset
    nav_content_entry = {}
    for line in navtree_content:
        current_level += 0.5 * line.count("[")
        current_level -= 0.5 * line.count("]")
        pattern = re.compile('\[ \"([^\"]*)\", \"?([^\",]*)\"?, ([^\[\]]*)?')
        matches = pattern.match(line)
        if matches:
            label = matches[1]
            if matches[2].strip() == "null":
                link = "None"
            else:
                link = matches[2]
            child = matches[3]
            if child == "null " or child == "":
                child = None
            nav_content_entry = {
                'level': current_level-0.5+line.count("]"),
                'label': label,
                'link': link.replace('.html','.adoc')
            }
            nav_content.append(nav_content_entry)
            if child:
                child = child.replace("\"","").strip()
                child_content = parse_js_var(source_path,child,child,current_level-0.5+line.count("]"))
                nav_content = nav_content + child_content

    return nav_content


def get_navigation_structure(source_path,fname,target_path,module_path):
    path = ""
    if target_path:
        path = target_path + "/"
    if fname=="navtree":
        print("building basic navtree")
    elif fname == "navtreedata":
        print("found navtree data")
        js_nav_content = parse_js_var(source_path,fname,"NAVTREE",0.0)
        nav_content = [":!sectnums:\n"]
        for e in js_nav_content:
            if e['link'] == "None":
                nav_content.append("*" * int(e['level']) + " {label}\n".format(label=e['label']))
            else:
                nav_content.append("*" * int(e['level']) + " xref:{path}{link}[{label}]\n".format(path=path,link=e['link'],label=e['label']))

        with open(module_path+"/nav.adoc","w") as nav:
            nav.writelines(nav_content)

    elif fname.find("navtreeindex")>-1:
        print("found "+fname)


def parse_file_and_create_adoc(source_path,fname,target_path,img_path):
    content = ""
    title= ""
    body= ""
    sections = []
    section = {}
    carry_over = ""
    carry_over_backup = ""

    with open(source_path+"/"+fname+".html", 'r') as source_file:
        content = source_file.read()
        # Initial content replacement
        content = re.sub(r'<img ([^\n]*)src=\"(?!http)',r'<img \1src="'+img_path+"/",content)
        content = re.sub(r'<object type=\"image/(.*)\" data=\"(?!http)',r'<object type="image/\1" data="'+img_path+"/",content)
        content = re.sub(r'<h2 class="memtitle">(.*)</h2>',r'<h3 id="sec_nn" class="memtitle">\1</h3>',content)

    content_split = content.split("\n")
    i = 0
    for index, line in enumerate(content_split):
        if line.find("sec_nn") > -1:
            line = line.replace("sec_nn","sec_"+str(i))
            i+=1
            content_split[index] = line

    content = "\n".join(content_split)



    pq = PyQuery(content)
    title = pq('div.title').text()
    if not title:
        title_start = content.find("<title>")
        title_end = content.find("</title>")
        if not title_start == title_end:
            title = content[title_start+len("<title>"):title_end]
    current_header = "= " + title+"\n:page-width-limit: none\n\n"
    body = pq('.contents')

    h3 = body('h3')
    h3.wrap('<div class="sect2"></div>')


    section_test = PyQuery(body)('h2')
    i = 0
    for item in section_test.items():
        # Fix sections within tables!
        index_t = -1
        index_h = -1
        index_i = -1
        section_start = ""
        section = {}
        j = body.html().find(item.text())
        section_start = "== "
        if(item.parent().is_("td")):
            heading = item.parent().parent()
            table = heading.parent()
            index_i = body.html().find(item.text()+"</h2>")
            # index_t = body.html().find(table.outer_html()[:100])
            index_t = body.html().rfind("<table",0,index_i)
            index_h = body.html().find(heading.outer_html()[:10],index_t)
            carry_over_backup = carry_over
            carry_over = body.html()[index_t:index_h]
            # if fname == "structosi3_1_1CameraDetection":
            #     print(index_i, index_t, index_h)
            #     print(body.html()[index_t:index_h])

        j = body.html()[0:j].rfind("<h2")
        k = body.html().find("</h2>",j) + len("</h2>")

        # carry_over created this item
        if index_t>-1:
            section_text = carry_over_backup+body.html()[i:index_t]
            carry_over_backup = ""
            k = body.html().find(table(':nth-child(2)').outer_html()[:20])

        # carry_over from previous item exists
        elif carry_over:
            section_text = carry_over+body.html()[i:j]
            carry_over = ""

        # no carry_over defined
        else:
            section_text = body.html()[i:j]

        section['header'] = current_header
        section['html'] = section_text
        section['start'] = i
        sections.append(section)
        current_header = section_start + item.text()
        i = k

    k = body.html().find("<!-- contents -->")
    k = body.html().rfind("</div>",0,k)
    sections.append({'header':current_header,'html':body.html()[i:k]})


    with open(target_path+"/"+fname+".adoc","w", encoding="utf-8") as file:
        for sec in sections:
            file.write(sec['header']+"\n\n++++\n")
            file.writelines(sec['html'])
            file.write("\n\n++++\n\n")



def main(argv):
    source_path = "ASAM_OSI_reference"
    target_path = source_path+"/converted"
    module_path = "../_antora/modules/ROOT"
    img_path = "../_attachments"
    module_content_path = ""

    if len(argv)>=1 and argv[0]:
        source_path = argv[0]
    if len(argv)>=2 and argv[1]:
        target_path = argv[0]+"/"+argv[1]
    if len(argv)>=3 and argv[2]:
        module_path = argv[2]
    if len(argv)>=4 and argv[3]:
        img_path = argv[3]
    if len(argv)>=5 and argv[4]:
        module_content_path = argv[4]

    Path(target_path).mkdir(parents=True, exist_ok= True)
    Path(target_path+"/_attachments").mkdir(parents=True, exist_ok= True)
    Path(module_path).mkdir(parents=True, exist_ok= True)
    for root, dirs, files in os.walk(source_path):
        for f in files:
            fname, extension = os.path.splitext(f)
            if extension == ".html":
                parse_file_and_create_adoc(source_path,fname,target_path, img_path)
            elif extension == ".js":
                get_navigation_structure(source_path,fname,module_content_path,module_path)
            elif extension not in [".html",".js"]:
                shutil.copy(root+"/"+f,os.getcwd()+"/"+target_path+"/_attachments")
        break


if __name__ == "__main__":
   main(sys.argv[1:])
