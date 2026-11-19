import math
def swe(x,x50,xm,b):
    if x>=xm: return 1.0
    return 1/(1+(math.log(xm/x)/math.log(xm/x50))**b)
def count(V,x50,xm,n,cut,kv=0.5,bins=400):
    b=2*math.log(2)*math.log(xm/x50)*n
    xs=[cut*(xm/cut)**(i/bins) for i in range(bins+1)]
    N=0;Vc=0
    for a,c in zip(xs,xs[1:]):
        dv=V*(swe(c,x50,xm,b)-swe(a,x50,xm,b)); xm_=math.sqrt(a*c)
        N+=dv/(kv*xm_**3); Vc+=dv
    return b,N,Vc/V
for name,V,x50,xm,n in [("UG ronda 16m2x4m",64,0.08,0.6,1.2),("UG cut zona 1m2x4m",4,0.03,0.3,1.0),("banco 1 taladro 4.5x5x12",270,0.30,2.0,1.5),("anillo tajeo 2.5m burden x 150m2",375,0.25,2.0,1.3)]:
    for cut in (0.05,0.1,0.2,0.3):
        b,N,f=count(V,x50,xm,n,cut)
        print(f"{name:32s} b={b:.2f} cut={cut:4.2f} N={N:10.0f} fracVol>cut={f:.2f}")
